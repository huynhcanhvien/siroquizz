import { z } from "zod";
import { preferencesSchema } from "@/features/srs/schemas";
export const activityDaySchema = z.object({
  day: z.string(),
  cards: z.number(),
  correct: z.number(),
  minutes: z.number(),
  goalMet: z.boolean(),
});
export const statsSchema = z.object({
  preferences: preferencesSchema,
  today: activityDaySchema,
  streak: z.object({ current: z.number(), longest: z.number() }),
  knownCards: z.number(),
  activity: activityDaySchema.array(),
  forecast: z.array(z.object({ day: z.string(), count: z.number() })),
  accuracy: z.array(
    z.object({
      setId: z.string(),
      title: z.string(),
      score: z.number(),
      total: z.number(),
      accuracy: z.number(),
    }),
  ),
  weekly: z.array(z.object({ day: z.string(), minutes: z.number() })),
  learnedHistory: z.array(z.object({ day: z.string(), count: z.number() })),
});
