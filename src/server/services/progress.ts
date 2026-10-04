import "server-only";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { v7 } from "uuid";
import { z } from "zod";
import { gameScoreInputSchema, testResultInputSchema } from "@/features/progress/schemas";
import { CARD_STATUSES, GAME_KINDS } from "@/lib/types";
import { ApiError } from "../api-error";
import type { Database } from "../db/client";
import {
  cards,
  cardProgress,
  gameScores,
  studyActivity,
  testResults,
  studySets,
} from "../db/schema";
import { lockLearner, reviewInTransaction } from "./learning";
import { requireOwnedSet, uuidSchema } from "./sets";

export async function getProgress(db: Database, ownerId: string, setId: string) {
  await requireOwnedSet(db, ownerId, setId);
  const rows = await db
    .select()
    .from(cardProgress)
    .where(and(eq(cardProgress.userId, ownerId), eq(cardProgress.setId, setId)))
    .limit(500);
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
}
export async function putProgress(db: Database, ownerId: string, setId: string, input: unknown) {
  const data = z
    .object({
      cards: z
        .array(z.object({ cardId: z.uuid(), status: z.enum(CARD_STATUSES) }))
        .min(1)
        .max(500),
    })
    .parse(input);
  return db.transaction(async (tx) => {
    await lockLearner(tx, ownerId);
    await requireOwnedSet(tx, ownerId, setId, true);
    const ids = data.cards.map((c) => c.cardId);
    const found = await tx
      .select({ id: cards.id })
      .from(cards)
      .where(and(eq(cards.setId, setId), inArray(cards.id, ids)))
      .limit(500);
    if (found.length !== ids.length || new Set(ids).size !== ids.length)
      throw new ApiError(404, "NOT_FOUND");
    const rows = [];
    for (const card of data.cards) {
      if (card.status === "new") {
        const [row] = await tx
          .insert(cardProgress)
          .values({ ...card, userId: ownerId, setId, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: [cardProgress.userId, cardProgress.cardId],
            set: { status: card.status, updatedAt: new Date() },
          })
          .returning();
        rows.push({ ...row, updatedAt: row.updatedAt.toISOString() });
      } else
        rows.push(
          await reviewInTransaction(tx, ownerId, {
            eventId: v7(),
            cardId: card.cardId,
            rating: card.status === "known" ? 3 : 1,
            mode: "flashcards",
            durationMs: 0,
          }),
        );
    }
    return rows;
  });
}
export async function resetProgress(db: Database, ownerId: string, setId: string) {
  await db.transaction(async (tx) => {
    await requireOwnedSet(tx, ownerId, setId, true);
    await tx
      .delete(cardProgress)
      .where(and(eq(cardProgress.userId, ownerId), eq(cardProgress.setId, setId)));
  });
}
const historyQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(50),
  cursor: z.uuid().optional(),
  game: z.enum(GAME_KINDS).optional(),
});
export async function listHistory(
  db: Database,
  ownerId: string,
  setId: string,
  kind: "test" | "game",
  query: URLSearchParams,
) {
  await requireOwnedSet(db, ownerId, setId);
  const { limit, cursor, game } = historyQuery.parse(Object.fromEntries(query));
  const table = kind === "test" ? testResults : gameScores;
  const filters = [eq(table.userId, ownerId), eq(table.setId, setId)];
  if (cursor) filters.push(lt(table.id, cursor));
  if (kind === "game" && game) filters.push(eq(gameScores.game, game));
  const rows = await db
    .select()
    .from(table)
    .where(and(...filters))
    .orderBy(desc(table.id))
    .limit(limit + 1);
  const data = rows.slice(0, limit).map((row) => {
    if ("takenAt" in row) return { ...row, takenAt: row.takenAt.toISOString() };
    return { ...row, playedAt: row.playedAt.toISOString() };
  });
  return { data, meta: { nextCursor: rows.length > limit ? data.at(-1)!.id : null } };
}
export async function saveTest(db: Database, ownerId: string, setId: string, input: unknown) {
  const data = testResultInputSchema
    .extend({
      total: z.number().int().min(1).max(500),
      durationMs: z.number().int().min(0).max(2147483647),
    })
    .refine((v) => v.score <= v.total && v.setId === setId)
    .parse(input);
  return db.transaction(async (tx) => {
    await requireOwnedSet(tx, ownerId, setId, true);
    const [row] = await tx
      .insert(testResults)
      .values({ ...data, id: v7(), userId: ownerId })
      .returning();
    return { ...row, takenAt: row.takenAt.toISOString() };
  });
}
export async function correctTest(db: Database, ownerId: string, id: string, input: unknown) {
  const { score } = z.object({ score: z.number().int().min(0).max(500) }).parse(input);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(testResults)
      .where(and(eq(testResults.id, uuidSchema.parse(id)), eq(testResults.userId, ownerId)))
      .limit(1)
      .for("update");
    if (!row) throw new ApiError(404, "NOT_FOUND");
    await requireOwnedSet(tx, ownerId, row.setId);
    if (score > row.total) throw new ApiError(400, "VALIDATION_ERROR");
    await tx.update(testResults).set({ score }).where(eq(testResults.id, id));
    return { ...row, score, takenAt: row.takenAt.toISOString() };
  });
}
export async function saveGame(db: Database, ownerId: string, setId: string, input: unknown) {
  const data = gameScoreInputSchema
    .extend({
      score: z.number().int().min(0).max(2147483647),
      timeMs: z.number().int().min(0).max(2147483647),
    })
    .refine((v) => v.setId === setId)
    .parse(input);
  return db.transaction(async (tx) => {
    await requireOwnedSet(tx, ownerId, setId, true);
    const [row] = await tx
      .insert(gameScores)
      .values({ ...data, id: v7(), userId: ownerId })
      .returning();
    return { ...row, playedAt: row.playedAt.toISOString() };
  });
}
export async function recordActivity(db: Database, ownerId: string, setId: string) {
  await db.transaction(async (tx) => {
    await requireOwnedSet(tx, ownerId, setId, true);
    await tx
      .insert(studyActivity)
      .values({ userId: ownerId, setId, at: new Date() })
      .onConflictDoUpdate({
        target: [studyActivity.userId, studyActivity.setId],
        set: { at: new Date() },
      });
  });
}
export async function recentActivity(db: Database, ownerId: string, query: URLSearchParams) {
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .parse(query.get("limit") ?? 10);
  const rows = await db
    .select({ userId: studyActivity.userId, setId: studyActivity.setId, at: studyActivity.at })
    .from(studyActivity)
    .innerJoin(studySets, eq(studySets.id, studyActivity.setId))
    .where(and(eq(studyActivity.userId, ownerId), sql`${studySets.deletedAt} is null`))
    .orderBy(desc(studyActivity.at))
    .limit(limit);
  return rows.map((row) => ({ ...row, at: row.at.toISOString() }));
}
