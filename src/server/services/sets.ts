import "server-only";
import { and, asc, desc, eq, inArray, isNull, lt, gt, or, sql, ilike } from "drizzle-orm";
import { v7 } from "uuid";
import { z } from "zod";
import { setInputSchema, type ValidSetInput } from "@/features/sets/schemas";
import type { StudySet } from "@/lib/types";
import { ApiError } from "../api-error";
import type { Database } from "../db/client";
import { attributionOf, markEdited, sharingOf } from "./sharing";
import {
  cards,
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

export async function requireOwnedSet(db: Db, ownerId: string, id: string, lock = false) {
  const query = db.select().from(studySets).where(owned(ownerId, id)).limit(1);
  const [set] = await (lock ? query.for("update") : query);
  if (!set) throw new ApiError(404, "NOT_FOUND");
  return set;
}
export async function getSet(db: Db, ownerId: string, id: string): Promise<StudySet> {
  const set = await requireOwnedSet(db, ownerId, id);
  const rows = await db
    .select({ card: cards, image: cardImages })
    .from(cards)
    .leftJoin(cardImages, eq(cardImages.cardId, cards.id))
    .where(eq(cards.setId, id))
    .orderBy(asc(cards.position))
    .limit(500);
  return {
    ...set,
    sharing: sharingOf(set),
    ...(set.copiedFromId
      ? { copiedFrom: await attributionOf(db, ownerId, set.copiedFromId) }
      : {}),
    termLang: set.termLang as StudySet["termLang"],
    definitionLang: set.definitionLang as StudySet["definitionLang"],
    cards: rows.map(({ card: c, image }) => ({
      id: c.id,
      term: c.term,
      definition: c.definition,
      ...(c.phonetic ? { phonetic: c.phonetic } : {}),
      ...(image ? { imageUrl: `/api/v1/images/${image.id}`, imageAlt: image.alt } : {}),
    })),
    createdAt: set.createdAt.toISOString(),
    updatedAt: set.updatedAt.toISOString(),
  };
}
export async function createSetInTransaction(db: Transaction, ownerId: string, input: unknown) {
  const data = setInputSchema.parse(input);
  // Serializes count+insert across concurrent requests by this owner.
  await db.select({ id: user.id }).from(user).where(eq(user.id, ownerId)).for("update");
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(studySets)
    .where(and(eq(studySets.ownerId, ownerId), isNull(studySets.deletedAt)));
  if (count >= 1000) throw new ApiError(409, "CONFLICT");
  const id = v7();
  await db
    .insert(studySets)
    .values({ id, ownerId, ...metadata(data), cardCount: data.cards.length });
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

export async function updateSet(db: Database, ownerId: string, id: string, input: unknown) {
  const data = setInputSchema.parse(input);
  const updated = await db.transaction(async (tx) => {
    await requireOwnedSet(tx, ownerId, id, true);
    const existing = await tx.select().from(cards).where(eq(cards.setId, id)).limit(500);
    const existingIds = new Set(existing.map((c) => c.id));
    const used = new Set<string>();
    const rows = data.cards.map((card, position) => {
      const cardId = card.id && existingIds.has(card.id) ? card.id : v7();
      if (used.has(cardId)) throw new ApiError(400, "VALIDATION_ERROR");
      used.add(cardId);
      return { ...card, id: cardId, setId: id, position, updatedAt: new Date() };
    });
    const removed = existing.filter((c) => !used.has(c.id)).map((c) => c.id);
    if (removed.length) await tx.delete(cards).where(inArray(cards.id, removed));
    // One statement for the whole deck instead of a round trip per card. Reused IDs come only
    // from this set's own cards (checked above); position uniqueness is deferred to commit.
    await tx
      .insert(cards)
      .values(rows.map((row) => ({ ...row, phonetic: row.phonetic ?? null })))
      .onConflictDoUpdate({
        target: cards.id,
        set: {
          term: sql`excluded.term`,
          definition: sql`excluded.definition`,
          phonetic: sql`excluded.phonetic`,
          position: sql`excluded.position`,
          updatedAt: sql`excluded.updated_at`,
        },
        setWhere: eq(cards.setId, id),
      });
    await tx
      .update(studySets)
      .set({ ...metadata(data), cardCount: rows.length, updatedAt: new Date() })
      .where(owned(ownerId, id));
    return getSet(tx, ownerId, id);
  });
  // A public set's new content must pass moderation again before it stays listed.
  if (updated.sharing?.visibility === "public") {
    await markEdited(db, id);
    return getSet(db, ownerId, id);
  }
  return updated;
}
export async function removeSet(db: Database, ownerId: string, id: string) {
  await db.transaction(async (tx) => {
    await requireOwnedSet(tx, ownerId, id, true);
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
export async function listSets(db: Database, ownerId: string, query: URLSearchParams) {
  const params = pageSchema.parse(Object.fromEntries(query));
  const filters = [eq(studySets.ownerId, ownerId), isNull(studySets.deletedAt)];
  if (params.source) filters.push(eq(studySets.source, params.source));
  if (params.q) filters.push(ilike(studySets.title, `%${params.q.replace(/[\\%_]/g, "\\$&")}%`));
  if (params.cursor) {
    let cursor: z.infer<typeof cursorSchema>;
    try {
      cursor = cursorSchema.parse(JSON.parse(Buffer.from(params.cursor, "base64url").toString()));
    } catch {
      throw new ApiError(400, "VALIDATION_ERROR");
    }
    if (cursor.sort !== params.sort) throw new ApiError(400, "VALIDATION_ERROR");
    if (params.sort === "recent") {
      const value = z.iso.datetime().parse(cursor.value);
      filters.push(
        or(
          lt(studySets.updatedAt, new Date(value)),
          and(eq(studySets.updatedAt, new Date(value)), lt(studySets.id, cursor.id)),
        )!,
      );
    } else if (params.sort === "name") {
      const value = z.string().parse(cursor.value);
      filters.push(
        or(
          gt(studySets.title, value),
          and(eq(studySets.title, value), lt(studySets.id, cursor.id)),
        )!,
      );
    } else {
      const value = z.number().int().parse(cursor.value);
      filters.push(
        or(
          lt(studySets.cardCount, value),
          and(eq(studySets.cardCount, value), lt(studySets.id, cursor.id)),
        )!,
      );
    }
  }
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
  const nextCursor =
    rows.length > params.limit && last
      ? Buffer.from(
          JSON.stringify({
            sort: params.sort,
            value:
              params.sort === "name"
                ? last.title
                : params.sort === "cards"
                  ? last.cardCount
                  : last.updatedAt.toISOString(),
            id: last.id,
          }),
        ).toString("base64url")
      : null;
  const cardRows = page.length
    ? await db
        .select({ card: cards, image: cardImages })
        .from(cards)
        .leftJoin(cardImages, eq(cardImages.cardId, cards.id))
        .where(
          inArray(
            cards.setId,
            page.map((set) => set.id),
          ),
        )
        .orderBy(asc(cards.position))
    : [];
  const cardsBySet = new Map<string, StudySet["cards"]>();
  for (const { card, image } of cardRows) {
    const setCards = cardsBySet.get(card.setId) ?? [];
    setCards.push({
      id: card.id,
      term: card.term,
      definition: card.definition,
      ...(card.phonetic ? { phonetic: card.phonetic } : {}),
      ...(image ? { imageUrl: `/api/v1/images/${image.id}`, imageAlt: image.alt } : {}),
    });
    cardsBySet.set(card.setId, setCards);
  }
  return {
    data: page.map((set): StudySet => ({
      ...set,
      sharing: sharingOf(set),
      termLang: set.termLang as StudySet["termLang"],
      definitionLang: set.definitionLang as StudySet["definitionLang"],
      cards: cardsBySet.get(set.id) ?? [],
      createdAt: set.createdAt.toISOString(),
      updatedAt: set.updatedAt.toISOString(),
    })),
    meta: { nextCursor },
  };
}
