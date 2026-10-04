import { z } from "zod";
import { CARD_STATUSES, GAME_KINDS } from "@/lib/types";

export const cardProgressSchema = z.object({
  userId: z.string().min(1),
  setId: z.string().min(1),
  cardId: z.string().min(1),
  status: z.enum(CARD_STATUSES),
  updatedAt: z.string(),
});

export const testResultSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  setId: z.string().min(1),
  score: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  durationMs: z.number().int().nonnegative(),
  takenAt: z.string(),
});

export const gameScoreSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  setId: z.string().min(1),
  game: z.enum(GAME_KINDS),
  score: z.number().int().nonnegative(),
  timeMs: z.number().int().nonnegative(),
  playedAt: z.string(),
});

export const studyActivitySchema = z.object({
  userId: z.string().min(1),
  setId: z.string().min(1),
  at: z.string(),
});

export const testResultInputSchema = testResultSchema.pick({ setId: true, score: true, total: true, durationMs: true });
export type TestResultInput = z.infer<typeof testResultInputSchema>;

export const gameScoreInputSchema = gameScoreSchema.pick({ setId: true, game: true, score: true, timeMs: true });
export type GameScoreInput = z.infer<typeof gameScoreInputSchema>;
