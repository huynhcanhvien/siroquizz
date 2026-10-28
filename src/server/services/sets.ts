import "server-only";
import { and, asc, desc, eq, inArray, isNull, lt, gt, or, sql, ilike } from "drizzle-orm";
import { v7 } from "uuid";
import { z } from "zod";
import { setInputSchema, type ValidSetInput } from "@/features/sets/schemas";
import type { StudySet } from "@/lib/types";
import { ApiError } from "../api-error";
import type { Database } from "../db/client";
import { attributionOf, markEdited, sharingOf } from "./sharing";
import { lockStrength, requireStudySet, type SetLock, type SetRow } from "./access";
import { clawbackSetCredits } from "../ai/credits";
import { buildSearchText } from "@/features/community/lib/search";
import {
  cards,
  cardProgress,
  studySets,
  user,
  testResults,
  gameScores,
  studyActivity,
  cardImages,
} from "../db/schema";

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Db = Database | Transaction;
export const uuidSchema = z.uuid();
const owned = (ownerId: string, id: string) =>
  and(
    eq(studySets.id, uuidSchema.parse(id)),
    eq(studySets.ownerId, ownerId),
    isNull(studySets.deletedAt),
  );

/** The set fields clients see; internal columns (search text, moderation, slug) stay server-side. */
const publicFields = (set: typeof studySets.$inferSelect) => ({
  id: set.id,
  ownerId: set.ownerId,
  title: set.title,
  description: set.description,
  source: set.source,
});

export async function requireOwnedSet(db: Db, ownerId: string, id: string, lock: SetLock = false) {
  const query = db.select().from(studySets).where(owned(ownerId, id)).limit(1);
  const [set] = await (lock ? query.for(lockStrength(lock)) : query);
  if (!set) throw new ApiError(404, "NOT_FOUND");
  return set;
}
type CardRow = typeof cards.$inferSelect;
type ImageRow = typeof cardImages.$inferSelect;
/** The card fields clients see, with the image served through the access-checked route. */
export const toCardDto = ({ card, image }: { card: CardRow; image: ImageRow | null }) => ({
  id: card.id,
  term: card.term,
  definition: card.definition,
  ...(card.phonetic ? { phonetic: card.phonetic } : {}),
  ...(card.example ? { example: card.example } : {}),
  ...(image ? { imageUrl: `/api/v1/images/${image.id}`, imageAlt: image.alt } : {}),
});
/** The set's cards in order, each with its image if any. */
const deckOf = (db: Db, setId: string) =>
  db
    .select({ card: cards, image: cardImages })
    .from(cards)
    .leftJoin(cardImages, eq(cardImages.cardId, cards.id))
    .where(eq(cards.setId, setId))
    .orderBy(asc(cards.position))
    .limit(500);
/** A set for studying: the viewer's own, or one assigned to their class (read-only for them). */
export async function getSet(db: Db, viewerId: string, id: string): Promise<StudySet> {
  const set = await requireStudySet(db, viewerId, id);
  const isOwner = set.ownerId === viewerId;
  const rows = await deckOf(db, set.id);
  return {
    ...publicFields(set),
    // Sharing settings belong to the owner; a student studying an assigned set does not see them.
    ...(isOwner ? { sharing: sharingOf(set) } : {}),
    ...(isOwner && set.copiedFromId
      ? { copiedFrom: await attributionOf(db, viewerId, set.copiedFromId) }
      : {}),
    termLang: set.termLang as StudySet["termLang"],
    definitionLang: set.definitionLang as StudySet["definitionLang"],
    cards: rows.map(toCardDto),
    cardCount: rows.length,
    createdAt: set.createdAt.toISOString(),
    updatedAt: set.updatedAt.toISOString(),
  };
}
export async function createSetInTransaction(
  db: Transaction,
  ownerId: string,
  input: unknown,
  { copiedFromId = null }: { copiedFromId?: string | null } = {},
) {
  const data = setInputSchema.parse(input);
  // Serializes count+insert across concurrent requests by this owner.
  await db.select({ id: user.id }).from(user).where(eq(user.id, ownerId)).for("update");
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(studySets)
    .where(and(eq(studySets.ownerId, ownerId), isNull(studySets.deletedAt)));
  if (count >= 1000) throw new ApiError(409, "CONFLICT");
  const id = v7();
  await db.insert(studySets).values({
    id,
    ownerId,
    ...metadata(data),
    cardCount: data.cards.length,
    searchText: buildSearchText({ ...data, tags: [] }),
    copiedFromId,
  });
  await db
    .insert(cards)
    .values(data.cards.map((card, position) => ({ ...card, id: v7(), setId: id, position })));
  return getSet(db, ownerId, id);
}
const metadata = ({ title, description, termLang, definitionLang, source }: ValidSetInput) => ({
  title,
  description,
  termLang,
  definitionLang,
  source,
});

type DeckCard = Omit<ValidSetInput["cards"][number], "phonetic" | "example"> & {
  phonetic?: string;
  example?: string;
};
/**
 * Replaces a set's cards with `deck`, in order. IDs of the set's own cards are kept (so progress
 * survives); unknown or foreign IDs get fresh ones; missing cards are deleted. Returns the count.
 */
export async function replaceDeck(
  tx: Transaction,
  setId: string,
  deck: readonly DeckCard[],
): Promise<number> {
  const existing = await tx
    .select({ id: cards.id })
    .from(cards)
    .where(eq(cards.setId, setId))
    .limit(500);
  const existingIds = new Set(existing.map((c) => c.id));
  const used = new Set<string>();
  const now = new Date();
  const rows = deck.map((card, position) => {
    const cardId = card.id && existingIds.has(card.id) ? card.id : v7();
    if (used.has(cardId)) throw new ApiError(400, "VALIDATION_ERROR");
    used.add(cardId);
    return { ...card, id: cardId, setId, position, updatedAt: now };
  });
  const removed = existing.filter((c) => !used.has(c.id)).map((c) => c.id);
  if (removed.length) await tx.delete(cards).where(inArray(cards.id, removed));
  // One statement for the whole deck instead of a round trip per card. Reused IDs come only
  // from this set's own cards (checked above); position uniqueness is deferred to commit.
  await tx
    .insert(cards)
    .values(
      rows.map((row) => ({ ...row, phonetic: row.phonetic ?? null, example: row.example ?? null })),
    )
    .onConflictDoUpdate({
      target: cards.id,
      set: {
        term: sql`excluded.term`,
        definition: sql`excluded.definition`,
        phonetic: sql`excluded.phonetic`,
        example: sql`excluded.example`,
        position: sql`excluded.position`,
        updatedAt: sql`excluded.updated_at`,
      },
      setWhere: eq(cards.setId, setId),
    });
  return rows.length;
}
/** Writes the set's own fields after its deck changed; the caller already checked access. */
export async function writeSetFields(
  tx: Transaction,
  set: SetRow,
  data: ValidSetInput,
  cardCount: number,
) {
  await tx
    .update(studySets)
    .set({
      ...metadata(data),
      cardCount,
      searchText: buildSearchText({ ...data, tags: set.tags }),
      updatedAt: new Date(),
    })
    .where(eq(studySets.id, set.id));
}
export async function updateSet(db: Database, ownerId: string, id: string, input: unknown) {
  const data = setInputSchema.parse(input);
  await db.transaction(async (tx) => {
    const current = await requireOwnedSet(tx, ownerId, id, "update");
    await writeSetFields(tx, current, data, await replaceDeck(tx, id, data.cards));
  });
  // New content needs a new moderation verdict (checked now if the set is public).
  await markEdited(db, id);
  return getSet(db, ownerId, id);
}
export async function removeSet(db: Database, ownerId: string, id: string) {
  await db.transaction(async (tx) => {
    await requireOwnedSet(tx, ownerId, id, "update");
    await tx
      .update(studySets)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(owned(ownerId, id));
    // Retain only the tombstone; remove private learning history in this transaction.
    await tx.delete(cards).where(eq(cards.setId, id));
    await tx.delete(testResults).where(eq(testResults.setId, id));
    await tx.delete(gameScores).where(eq(gameScores.setId, id));
    await tx.delete(studyActivity).where(eq(studyActivity.setId, id));
  });
  // A reward for publishing this set does not outlive it (create-publish-delete farming).
  await clawbackSetCredits(db, ownerId, id);
}
const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(50),
  cursor: z.string().max(512).optional(),
  q: z.string().max(120).optional(),
  source: z.enum(["manual", "ai", "import"]).optional(),
  sort: z.enum(["recent", "name", "cards"]).default("recent"),
});
const cursorSchema = z.object({
  sort: z.enum(["recent", "name", "cards"]),
  value: z.union([z.string().max(120), z.number().int().min(2).max(500)]),
  id: z.uuid(),
});
type PageParams = z.infer<typeof pageSchema>;
/** Keyset condition continuing after the cursor's row in the requested order. */
function afterCursor(params: PageParams, encoded: string) {
  let cursor: z.infer<typeof cursorSchema>;
  try {
    cursor = cursorSchema.parse(JSON.parse(Buffer.from(encoded, "base64url").toString()));
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR");
  }
  if (cursor.sort !== params.sort) throw new ApiError(400, "VALIDATION_ERROR");
  if (params.sort === "recent") {
    const value = new Date(z.iso.datetime().parse(cursor.value));
    return or(
      lt(studySets.updatedAt, value),
      and(eq(studySets.updatedAt, value), lt(studySets.id, cursor.id)),
    )!;
  }
  if (params.sort === "name") {
    const value = z.string().parse(cursor.value);
    return or(
      gt(studySets.title, value),
      and(eq(studySets.title, value), lt(studySets.id, cursor.id)),
    )!;
  }
  const value = z.number().int().parse(cursor.value);
  return or(
    lt(studySets.cardCount, value),
    and(eq(studySets.cardCount, value), lt(studySets.id, cursor.id)),
  )!;
}
function encodeCursor(sort: PageParams["sort"], last: SetRow) {
  const value =
    sort === "name" ? last.title : sort === "cards" ? last.cardCount : last.updatedAt.toISOString();
  return Buffer.from(JSON.stringify({ sort, value, id: last.id })).toString("base64url");
}
const listedSet = (set: SetRow, progress: StudySet["progress"]): StudySet => ({
  ...publicFields(set),
  sharing: sharingOf(set),
  termLang: set.termLang as StudySet["termLang"],
  definitionLang: set.definitionLang as StudySet["definitionLang"],
  // Library cards show only counts; the deck loads with the set itself.
  cards: [],
  cardCount: set.cardCount,
  progress: progress ?? { known: 0, learning: 0 },
  createdAt: set.createdAt.toISOString(),
  updatedAt: set.updatedAt.toISOString(),
});
export async function listSets(db: Database, ownerId: string, query: URLSearchParams) {
  const params = pageSchema.parse(Object.fromEntries(query));
  const filters = [eq(studySets.ownerId, ownerId), isNull(studySets.deletedAt)];
  if (params.source) filters.push(eq(studySets.source, params.source));
  if (params.q) filters.push(ilike(studySets.title, `%${params.q.replace(/[\\%_]/g, "\\$&")}%`));
  if (params.cursor) filters.push(afterCursor(params, params.cursor));
  const ordering =
    params.sort === "name"
      ? asc(studySets.title)
      : params.sort === "cards"
        ? desc(studySets.cardCount)
        : desc(studySets.updatedAt);
  const rows = await db
    .select()
    .from(studySets)
    .where(and(...filters))
    .orderBy(ordering, desc(studySets.id))
    .limit(params.limit + 1);
  const page = rows.slice(0, params.limit);
  const last = page.at(-1);
  const progress = await progressCounts(
    db,
    ownerId,
    page.map((set) => set.id),
  );
  return {
    data: page.map((set) => listedSet(set, progress.get(set.id))),
    meta: {
      nextCursor: rows.length > params.limit && last ? encodeCursor(params.sort, last) : null,
    },
  };
}

/** The viewer's known/learning card counts for each listed set, in one grouped query. */
async function progressCounts(db: Db, userId: string, setIds: string[]) {
  if (!setIds.length) return new Map<string, { known: number; learning: number }>();
  const rows = await db
    .select({
      setId: cardProgress.setId,
      known: sql<number>`(count(*) filter (where ${cardProgress.status} = 'known'))::int`,
      learning: sql<number>`(count(*) filter (where ${cardProgress.status} = 'learning'))::int`,
    })
    .from(cardProgress)
    .where(and(eq(cardProgress.userId, userId), inArray(cardProgress.setId, setIds)))
    .groupBy(cardProgress.setId);
  return new Map(rows.map(({ setId, known, learning }) => [setId, { known, learning }]));
}

/**
 * Copies a set the person may study into their library. A copy of someone else's set keeps
 * pointing at the original, so it is credited and earns its copier no publish reward.
 */
export async function duplicateSet(db: Database, viewerId: string, id: string, title: string) {
  const original = await requireStudySet(db, viewerId, id);
  const deck = await deckOf(db, original.id);
  const copiedFromId = original.ownerId === viewerId ? original.copiedFromId : original.id;
  return db.transaction((tx) =>
    createSetInTransaction(
      tx,
      viewerId,
      {
        title,
        description: original.description,
        termLang: original.termLang,
        definitionLang: original.definitionLang,
        source: original.source,
        cards: deck.map(toCardDto),
      },
      { copiedFromId },
    ),
  );
}
