import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { v7 } from "uuid";
import {
  cardProgressSchema,
  gameScoreSchema,
  studyActivitySchema,
  testResultSchema,
} from "@/features/progress/schemas";
import { setInputSchema } from "@/features/sets/schemas";
import type { Database } from "../db/client";
import {
  cardProgress,
  gameScores,
  localImports,
  studyActivity,
  testResults,
  user,
} from "../db/schema";
import { createSetInTransaction } from "./sets";
import { ApiError } from "../api-error";

const boundedId = z.string().min(1).max(128);
const localSet = setInputSchema.extend({
  id: boundedId,
  cards: setInputSchema.shape.cards.element.extend({ id: boundedId }).array().min(2).max(500),
});
export const localImportSchema = z.object({
  sets: z.array(localSet).max(1000),
  progress: z.array(cardProgressSchema).max(50000).default([]),
  testResults: z
    .array(
      testResultSchema.refine(
        (v) => v.score <= v.total && v.total <= 500 && v.durationMs <= 2147483647,
      ),
    )
    .max(10000)
    .default([]),
  gameScores: z
    .array(gameScoreSchema.refine((v) => v.score <= 2147483647 && v.timeMs <= 2147483647))
    .max(10000)
    .default([]),
  activity: z.array(studyActivitySchema).max(50).default([]),
});
export async function importLocal(db: Database, ownerId: string, input: unknown) {
  const data = localImportSchema.parse(input);
  if (
    new Set(data.sets.map((set) => set.id)).size !== data.sets.length ||
    data.sets.some((set) => new Set(set.cards.map((card) => card.id)).size !== set.cards.length)
  )
    throw new ApiError(400, "VALIDATION_ERROR");
  return db.transaction(async (tx) => {
    await tx.select({ id: user.id }).from(user).where(eq(user.id, ownerId)).for("update");
    const imported: string[] = [];
    for (const local of data.sets) {
      const [previous] = await tx
        .select()
        .from(localImports)
        .where(and(eq(localImports.userId, ownerId), eq(localImports.localSetId, local.id)))
        .limit(1);
      if (previous) {
        imported.push(local.id);
        continue;
      }
      const set = await createSetInTransaction(tx, ownerId, local);
      const cardIds = new Map(local.cards.map((card, i) => [card.id, set.cards[i].id]));
      const seen = new Set<string>();
      for (const p of data.progress.filter((row) => row.setId === local.id)) {
        const cardId = cardIds.get(p.cardId);
        if (cardId && !seen.has(cardId)) {
          seen.add(cardId);
          await tx
            .insert(cardProgress)
            .values({ userId: ownerId, setId: set.id, cardId, status: p.status });
        }
      }
      for (const r of data.testResults.filter((row) => row.setId === local.id))
        await tx.insert(testResults).values({
          id: v7(),
          userId: ownerId,
          setId: set.id,
          score: r.score,
          total: r.total,
          durationMs: r.durationMs,
          takenAt: validDate(r.takenAt),
        });
      for (const r of data.gameScores.filter((row) => row.setId === local.id))
        await tx.insert(gameScores).values({
          id: v7(),
          userId: ownerId,
          setId: set.id,
          game: r.game,
          score: r.score,
          timeMs: r.timeMs,
          playedAt: validDate(r.playedAt),
        });
      const recent = data.activity.find((row) => row.setId === local.id);
      if (recent)
        await tx
          .insert(studyActivity)
          .values({ userId: ownerId, setId: set.id, at: validDate(recent.at) });
      await tx
        .insert(localImports)
        .values({ userId: ownerId, localSetId: local.id, setId: set.id });
      imported.push(local.id);
    }
    return { imported };
  });
}
function validDate(value: string) {
  const parsed = z.iso.datetime().safeParse(value);
  return parsed.success ? new Date(parsed.data) : new Date();
}
