import { z } from "zod";
import { CONTENT_LANGUAGES } from "@/lib/types";
import { cardInputSchema } from "@/features/sets/schemas";
export const generationOptionsSchema = z.object({
  cardCount: z.number().int().min(5).max(200),
  termLang: z.enum(CONTENT_LANGUAGES),
  definitionLang: z.enum(CONTENT_LANGUAGES),
  includePhonetic: z.boolean(),
});
export const jobInputSchema = z
  .object({
    uploadIds: z.array(z.uuid()).max(5),
    prompt: z.string().trim().max(1000),
    options: generationOptionsSchema,
  })
  .refine((v) => v.prompt.length > 0 || v.uploadIds.length > 0);
export const generatedCardsSchema = z.array(cardInputSchema).min(2).max(200);
export const generationResultSchema = z.object({
  cards: generatedCardsSchema.element.extend({ id: z.string() }).array().min(2).max(200),
  usedSamples: z.literal(false),
  unreadFiles: z.array(z.string()),
});
const usageSchema = z.object({
  input: z.number(),
  output: z.number(),
  cached: z.number(),
  cost: z.number(),
});
const stateCardSchema = z.object({
  term: z.string(),
  definition: z.string(),
  phonetic: z.string(),
});
/** Persisted between serverless steps so a long generation resumes where it left off. */
export const aiJobStateSchema = z.object({
  phase: z.enum(["extract", "generate", "finalize"]),
  texts: z.array(z.string()),
  extractIndex: z.number().int().min(0),
  pdfPageCursor: z.number().int().min(0),
  pagesCounted: z.boolean(),
  chunks: z.array(z.string()).nullable(),
  chunkIndex: z.number().int().min(0),
  rawCards: z.array(stateCardSchema),
  usage: usageSchema,
});
export type AiJobState = z.infer<typeof aiJobStateSchema>;

export const jobStatusSchema = z.enum([
  "queued",
  "extracting",
  "generating",
  "validating",
  "done",
  "error",
  "cancelled",
]);
export const jobStepSchema = z.object({
  status: jobStatusSchema,
  stage: z.enum([
    "uploading",
    "reading",
    "analyzing",
    "generating",
    "validating",
    "done",
  ]),
  completed: z.number().int().optional(),
  total: z.number().int().optional(),
  result: generationResultSchema.nullable().optional(),
  errorCode: z.string().nullable().optional(),
});

export const quotaSchema = z.object({
  remaining: z.number().int(),
  limit: z.number().int(),
  resetsAt: z.string(),
});
export const jobSummarySchema = z.object({
  id: z.uuid(),
  status: z.enum([
    "queued",
    "extracting",
    "generating",
    "validating",
    "done",
    "error",
    "cancelled",
  ]),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  prompt: z.string(),
  options: generationOptionsSchema,
  result: generationResultSchema.nullable(),
  errorCode: z.string().nullable(),
});
