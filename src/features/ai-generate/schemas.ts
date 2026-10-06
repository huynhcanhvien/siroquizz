import { z } from "zod";
import { CONTENT_LANGUAGES } from "@/lib/types";
import { cardInputSchema } from "@/features/sets/schemas";
import { GENERATION_STAGES } from "./lib/generator";
export const generationOptionsSchema = z.object({
  cardCount: z.number().int().min(5).max(200),
  termLang: z.enum(CONTENT_LANGUAGES),
  definitionLang: z.enum(CONTENT_LANGUAGES),
  includePhonetic: z.boolean(),
});
export type GenerationOptions = z.infer<typeof generationOptionsSchema>;
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
  /** Document parts the AI could not process, out of `totalParts`; absent on older results. */
  skippedParts: z.number().int().min(0).optional(),
  totalParts: z.number().int().min(0).optional(),
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
const generationTaskSchema = z.object({
  chunk: z.number().int().min(0),
  /** 0 for a chunk's first request; later parts are told which terms already exist. */
  part: z.number().int().min(0),
  count: z.number().int().min(1),
  attempts: z.number().int().min(0),
});
export type GenerationTask = z.infer<typeof generationTaskSchema>;
/**
 * Persisted between serverless steps so a long generation resumes where it left off. Fields added
 * later are optional so jobs that were mid-flight during a deploy still parse.
 */
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
  /** Pending generation requests; absent until extraction finishes. */
  tasks: z.array(generationTaskSchema).optional(),
  totalTasks: z.number().int().min(0).optional(),
  failedTasks: z.number().int().min(0).optional(),
  lastErrorCode: z.string().optional(),
  /** Consecutive steps that ended in a provider timeout during extraction. */
  stalls: z.number().int().min(0).optional(),
  /** Provider wait accumulated since the job last made progress. */
  throttledMs: z.number().int().min(0).optional(),
  /** Hash of the files + request + options; a finished identical job is reused for free. */
  cacheKey: z.string().optional(),
  /** Set when the result came from the cache, so nothing is charged. */
  cached: z.boolean().optional(),
  /** Estimated tokens of each chunk, used to price the generation for any card count. */
  chunkTokens: z.array(z.number().int().min(0)).optional(),
});
export type AiJobState = z.infer<typeof aiJobStateSchema>;

export const jobStatusSchema = z.enum([
  // The document was read; the job waits for the user to accept its credit estimate.
  "awaiting",
  "queued",
  "extracting",
  "generating",
  "validating",
  "done",
  "error",
  "cancelled",
]);
export const quotaSchema = z.object({
  dailyLimit: z.number().int(),
  dailyUsed: z.number().int(),
  dailyRemaining: z.number().int(),
  earned: z.number().int(),
  reserved: z.number().int(),
  available: z.number().int(),
  resetsAt: z.string(),
});
export type CreditQuota = z.infer<typeof quotaSchema>;
export const creditEstimateSchema = z.object({
  /** Credits the generation will take at `cardCount`. */
  credits: z.number().int().min(0),
  /** Credits already spent reading the document (OCR). */
  usedCredits: z.number().int().min(0),
  cardCount: z.number().int(),
  /** Per-chunk token sizes, so the browser can re-price other card counts. */
  chunkTokens: z.array(z.number().int().min(0)),
  quota: quotaSchema,
  maxJobCredits: z.number().int(),
});
export type CreditEstimate = z.infer<typeof creditEstimateSchema>;
export const jobStepSchema = z.object({
  status: jobStatusSchema,
  stage: z.enum(GENERATION_STAGES),
  completed: z.number().int().optional(),
  total: z.number().int().optional(),
  result: generationResultSchema.nullable().optional(),
  errorCode: z.string().nullable().optional(),
  /** The provider throttled the job; wait this long before the next step. */
  retryAfterMs: z.number().int().min(0).optional(),
  queuePosition: z.number().int().min(1).optional(),
  /** Present while the job is `awaiting` the user's go-ahead. */
  estimate: creditEstimateSchema.optional(),
  /** On a finished or failed job: credits taken, and whether a system failure refunded them. */
  creditsCharged: z.number().int().min(0).optional(),
  refunded: z.boolean().optional(),
});
export const jobSummarySchema = z.object({
  id: z.uuid(),
  status: jobStatusSchema,
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  prompt: z.string(),
  options: generationOptionsSchema,
  result: generationResultSchema.nullable(),
  errorCode: z.string().nullable(),
  creditsCharged: z.number().int().min(0).default(0),
});
