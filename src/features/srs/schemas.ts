import { z } from "zod";
import { cardSchema } from "@/features/sets/schemas";
export const preferencesSchema = z.object({
  newCardsPerDay: z.number().int().min(0).max(100),
  retention: z.number().min(0.7).max(0.97),
  timeZone: z
    .string()
    .max(80)
    .refine((zone) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: zone });
        return true;
      } catch {
        return false;
      }
    }),
  goalType: z.enum(["cards", "minutes"]),
  goal: z.number().int().min(1).max(500),
  reminderEnabled: z.boolean(),
  reminderHour: z.number().int().min(0).max(23),
  pushEnabled: z.boolean(),
});
export const preferenceDefaults = {
  newCardsPerDay: 20,
  retention: 0.9,
  timeZone: "Asia/Ho_Chi_Minh",
  goalType: "cards",
  goal: 20,
  reminderEnabled: false,
  reminderHour: 19,
  pushEnabled: false,
} as const;
export const reviewInputSchema = z.object({
  eventId: z.uuid(),
  cardId: z.uuid(),
  rating: z.number().int().min(1).max(4),
  mode: z.enum(["flashcards", "learn", "review"]),
  durationMs: z.number().int().min(0).max(3600000),
});
export const dueCardSchema = cardSchema.extend({
  setId: z.uuid(),
  setTitle: z.string(),
  termLang: z.string(),
  definitionLang: z.string(),
  due: z.string(),
  isNew: z.boolean(),
});
export const dueResponseSchema = z.object({
  cards: dueCardSchema.array(),
  totalDue: z.number().int(),
  newRemaining: z.number().int(),
});
