import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { SetVisibility } from "@/lib/types";
import { ApiError } from "../api-error";
import type { Database } from "../db/client";
import { cardImages, cards, studySets, user } from "../db/schema";
import { awardCopyCredit } from "../ai/credits";
import { canViewSet, isAdmin, isListed } from "./access";
import { moderateSet } from "./moderation";
import { createSetInTransaction, requireOwnedSet, type Db } from "./sets";

const SLUG_LENGTH = 10;
const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const slugSchema = z.string().regex(/^[A-Za-z0-9]{10}$/);
/** Unguessable public link id (no look-alike characters, ~58 bits). */
export function newSlug() {
  return Array.from(
    randomBytes(SLUG_LENGTH),
    (byte) => SLUG_ALPHABET[byte % SLUG_ALPHABET.length],
  ).join("");
}

const visibilitySchema = z.object({ visibility: z.enum(["private", "unlisted", "public"]) });
/**
 * Changes who can see a set. Sharing gives it a permanent link; making it public sends it through
 * moderation, which approves it (and rewards the author) or queues it for a moderator.
 */
export async function setVisibility(db: Database, ownerId: string, setId: string, input: unknown) {
  const { visibility } = visibilitySchema.parse(input);
  const set = await db.transaction(async (tx) => {
    const current = await requireOwnedSet(tx, ownerId, setId, true);
    const slug = current.slug ?? (visibility === "private" ? null : await uniqueSlug(tx));
    // A first publication needs a check; an approved, flagged or rejected verdict stands until
    // the content changes (see markEdited).
    const moderationStatus =
      visibility === "public" && current.moderationStatus === "none"
        ? "pending"
        : current.moderationStatus;
    const [updated] = await tx
      .update(studySets)
      .set({ visibility, slug, moderationStatus })
      .where(eq(studySets.id, setId))
      .returning();
    return updated;
  });
  if (set.visibility === "public" && set.moderationStatus === "pending")
    await moderateSet(db, setId);
  return sharingOf(await requireOwnedSet(db, ownerId, setId));
}
async function uniqueSlug(db: Db) {
  for (;;) {
    const slug = newSlug();
    const [taken] = await db
      .select({ id: studySets.id })
      .from(studySets)
      .where(eq(studySets.slug, slug));
    if (!taken) return slug;
  }
}
/** Asks for a fresh automatic check of a public set the provider could not review yet. */
export async function retryModeration(db: Database, ownerId: string, setId: string) {
  await requireOwnedSet(db, ownerId, setId);
  await moderateSet(db, setId);
  return sharingOf(await requireOwnedSet(db, ownerId, setId));
}
/**
 * Called after the owner edits a set: a public set's content must be checked again before it
 * stays listed. Rejected sets get another chance once changed.
 */
export async function markEdited(db: Database, setId: string) {
  const [set] = await db
    .update(studySets)
    .set({ moderationStatus: "pending", moderationReason: null })
    .where(and(eq(studySets.id, setId), eq(studySets.visibility, "public")))
    .returning({ id: studySets.id });
  if (set) await moderateSet(db, setId);
}

export function sharingOf(set: typeof studySets.$inferSelect) {
  return {
    visibility: set.visibility as SetVisibility,
    slug: set.slug,
    moderationStatus: set.moderationStatus,
    moderationReason: set.moderationReason,
    hidden: Boolean(set.hiddenAt),
  };
}

async function setBySlug(db: Db, slug: string) {
  if (!slugSchema.safeParse(slug).success) throw new ApiError(404, "NOT_FOUND");
  const [row] = await db
    .select({
      set: studySets,
      author: { name: user.name, avatarColor: user.avatarColor, bannedAt: user.bannedAt },
    })
    .from(studySets)
    .innerJoin(user, eq(user.id, studySets.ownerId))
    .where(and(eq(studySets.slug, slug), isNull(studySets.deletedAt)))
    .limit(1);
  if (!row) throw new ApiError(404, "NOT_FOUND");
  return row;
}

export interface PublicSet {
  id: string;
  slug: string;
  title: string;
  description: string;
  termLang: string;
  definitionLang: string;
  source: string;
  cards: {
    id: string;
    term: string;
    definition: string;
    phonetic?: string;
    imageUrl?: string;
    imageAlt?: string;
  }[];
  author: { name: string; avatarColor: string };
  isOwner: boolean;
  listed: boolean;
  updatedAt: string;
}
/** A shared set as a guest or another user sees it: no private fields, 404 when not allowed. */
export async function getPublicSet(
  db: Db,
  viewerId: string | null,
  slug: string,
): Promise<PublicSet> {
  const { set, author } = await setBySlug(db, slug);
  const context = {
    ownerBanned: Boolean(author.bannedAt),
    viewerIsAdmin: viewerId !== null && viewerId !== set.ownerId && (await isAdmin(db, viewerId)),
  };
  if (!canViewSet(viewerId, set, context)) throw new ApiError(404, "NOT_FOUND");
  const rows = await db
    .select({ card: cards, image: cardImages })
    .from(cards)
    .leftJoin(cardImages, eq(cardImages.cardId, cards.id))
    .where(eq(cards.setId, set.id))
    .orderBy(asc(cards.position))
    .limit(500);
  return {
    id: set.id,
    slug,
    title: set.title,
    description: set.description,
    termLang: set.termLang,
    definitionLang: set.definitionLang,
    source: set.source,
    cards: rows.map(({ card, image }) => ({
      id: card.id,
      term: card.term,
      definition: card.definition,
      ...(card.phonetic ? { phonetic: card.phonetic } : {}),
      ...(image ? { imageUrl: `/api/v1/images/${image.id}`, imageAlt: image.alt } : {}),
    })),
    author: { name: author.name, avatarColor: author.avatarColor },
    isOwner: viewerId === set.ownerId,
    listed: isListed(set, context),
    updatedAt: set.updatedAt.toISOString(),
  };
}

/**
 * "Copy to my library": a new private set crediting the original. When someone else copies a
 * listed public set, its author earns a credit (once per person).
 */
export async function copyPublicSet(db: Database, viewerId: string, slug: string) {
  const source = await getPublicSet(db, viewerId, slug);
  const copy = await db.transaction(async (tx) => {
    const created = await createSetInTransaction(tx, viewerId, {
      title: source.title,
      description: source.description,
      termLang: source.termLang,
      definitionLang: source.definitionLang,
      source: source.source,
      cards: source.cards.map(({ term, definition, phonetic }) => ({
        term,
        definition,
        ...(phonetic ? { phonetic } : {}),
      })),
    });
    await tx.update(studySets).set({ copiedFromId: source.id }).where(eq(studySets.id, created.id));
    return created;
  });
  if (!source.isOwner && source.listed) {
    const [original] = await db
      .select({ ownerId: studySets.ownerId })
      .from(studySets)
      .where(eq(studySets.id, source.id));
    await awardCopyCredit(db, { authorId: original.ownerId, setId: source.id, copierId: viewerId });
  }
  return { id: copy.id };
}

/** "Copied from …" for a set's owner, while the original is still viewable by them. */
export async function attributionOf(db: Db, viewerId: string, copiedFromId: string | null) {
  if (!copiedFromId) return null;
  const [row] = await db
    .select({ set: studySets, author: { name: user.name, bannedAt: user.bannedAt } })
    .from(studySets)
    .innerJoin(user, eq(user.id, studySets.ownerId))
    .where(eq(studySets.id, copiedFromId))
    .limit(1);
  if (!row || !canViewSet(viewerId, row.set, { ownerBanned: Boolean(row.author.bannedAt) }))
    return null;
  return { title: row.set.title, slug: row.set.slug, authorName: row.author.name };
}
