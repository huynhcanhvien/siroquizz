import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { v7 } from "uuid";
import { z } from "zod";
import { MAX_SCRATCH } from "@/features/writing/lib/limits";
import {
  materializeSchema,
  scratchInputSchema,
  scratchPatchSchema,
} from "@/features/writing/schemas";
import { ApiError } from "../api-error";
import type { Database } from "../db/client";
import { scratchCards, user } from "../db/schema";
import { shareToClass } from "./class-library";
import { createSetInTransaction, type Transaction } from "./sets";
import { requireDocAccess } from "./writing-access";

type ScratchRow = typeof scratchCards.$inferSelect;
const toCard = (row: ScratchRow) => ({
  id: row.id,
  term: row.term,
  definition: row.definition,
  phonetic: row.phonetic,
  example: row.example,
  sourceDocId: row.sourceDocId,
  createdAt: row.createdAt.toISOString(),
});
const own = (userId: string, id: string) => {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) throw new ApiError(404, "NOT_FOUND");
  return and(eq(scratchCards.id, parsed.data), eq(scratchCards.userId, userId));
};
const blankToNull = (value: string | null | undefined) => (value ? value : null);

export async function listScratch(db: Database, userId: string) {
  const rows = await db
    .select()
    .from(scratchCards)
    .where(eq(scratchCards.userId, userId))
    .orderBy(asc(scratchCards.createdAt));
  return rows.map(toCard);
}

/** Saves a word; it keeps a link to the document it came from when the viewer can read it. */
export async function createScratch(db: Database, userId: string, input: unknown) {
  const data = scratchInputSchema.parse(input);
  const sourceDocId = data.sourceDocId
    ? await requireDocAccess(db, userId, data.sourceDocId, "read").then(
        (access) => access.doc.id,
        (error: unknown) => {
          // A document the person cannot read (any more) is simply not linked.
          if (error instanceof ApiError) return null;
          throw error;
        },
      )
    : null;
  return db.transaction(async (tx) => {
    await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(scratchCards)
      .where(eq(scratchCards.userId, userId));
    if (count >= MAX_SCRATCH) throw new ApiError(409, "SCRATCH_LIMIT");
    const [row] = await tx
      .insert(scratchCards)
      .values({
        id: v7(),
        userId,
        term: data.term,
        definition: data.definition,
        phonetic: blankToNull(data.phonetic),
        example: blankToNull(data.example),
        sourceDocId,
      })
      .returning();
    return toCard(row);
  });
}

export async function updateScratch(db: Database, userId: string, id: string, input: unknown) {
  const patch = scratchPatchSchema.parse(input);
  const [row] = await db
    .update(scratchCards)
    .set({
      ...patch,
      ...("phonetic" in patch ? { phonetic: blankToNull(patch.phonetic) } : {}),
      ...("example" in patch ? { example: blankToNull(patch.example) } : {}),
      updatedAt: new Date(),
    })
    .where(own(userId, id))
    .returning();
  if (!row) throw new ApiError(404, "NOT_FOUND");
  return toCard(row);
}

export async function deleteScratch(db: Database, userId: string, id: string) {
  const removed = await db
    .delete(scratchCards)
    .where(own(userId, id))
    .returning({ id: scratchCards.id });
  if (!removed.length) throw new ApiError(404, "NOT_FOUND");
}
export async function clearScratch(db: Database, userId: string) {
  await db.delete(scratchCards).where(eq(scratchCards.userId, userId));
}

/**
 * Shares the new set into a class library (WP3's shareToClass: any member may share their own set;
 * `audience` decides whether classmates or only teachers see it). It runs inside the caller's
 * transaction, where drizzle nests shareToClass's own transaction as a savepoint, so a refused
 * share also rolls back the new set.
 */
export async function publishToClass(
  tx: Transaction,
  userId: string,
  classId: string,
  setId: string,
  audience: "teachers" | "class",
) {
  await shareToClass(tx as unknown as Database, userId, classId, {
    itemType: "set",
    itemId: setId,
    audience,
  });
}

/**
 * Turns chosen scratch cards into a set (and removes them from the scratch list), optionally
 * sharing it with a class, all in one transaction.
 */
export async function materializeScratch(db: Database, userId: string, input: unknown) {
  const data = materializeSchema.parse(input);
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(scratchCards)
      .where(and(eq(scratchCards.userId, userId), inArray(scratchCards.id, data.ids)))
      .for("update");
    if (rows.length !== data.ids.length) throw new ApiError(404, "NOT_FOUND");
    if (rows.some((row) => !row.definition.trim())) throw new ApiError(400, "SCRATCH_INCOMPLETE");
    const order = new Map(data.ids.map((id, index) => [id, index]));
    const cards = [...rows]
      .sort((a, b) => order.get(a.id)! - order.get(b.id)!)
      .map((row) => ({
        term: row.term,
        definition: row.definition,
        ...(row.phonetic ? { phonetic: row.phonetic } : {}),
        ...(row.example ? { example: row.example } : {}),
      }));
    const set = await createSetInTransaction(tx, userId, {
      title: data.title,
      description: "",
      termLang: data.termLang,
      definitionLang: data.definitionLang,
      source: "manual",
      cards,
    });
    await tx.delete(scratchCards).where(inArray(scratchCards.id, data.ids));
    if (data.classId) await publishToClass(tx, userId, data.classId, set.id, data.audience);
    return { setId: set.id };
  });
}
