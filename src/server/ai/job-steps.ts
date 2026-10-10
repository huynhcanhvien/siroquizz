import "server-only";
import { createHash } from "node:crypto";
import { TransactionRollbackError, and, eq, gt, inArray } from "drizzle-orm";
import { v7 } from "uuid";
import { z } from "zod";
import {
  generationOptionsSchema,
  generationResultSchema,
  type AiJobState,
  type CreditEstimate,
} from "@/features/ai-generate/schemas";
import { estimateTokens, normalizeCards, splitDocument } from "@/features/ai-generate/lib/output";
import {
  AUTO_CONFIRM_CREDITS,
  MAX_JOB_CREDITS,
  MAX_OCR_PAGES,
  OCR_CREDITS_PER_PAGE,
  OCR_TOKENS_PER_PAGE,
  SYSTEM_ERROR_CODES,
  creditsForCards,
  estimateGenerationTokens,
  jobCredits,
} from "@/features/ai-generate/lib/credits";
import { parseAutoDetected } from "@/features/sets/lib/import-parser";
import type { GenerationStage, GenerateResult } from "@/features/ai-generate/lib/generator";
import { ApiError } from "../api-error";
import type { Database } from "../db/client";
import { aiJobs, aiResultCache, aiUploads } from "../db/schema";
import { getServerEnv } from "../env";
import { getUpload } from "./storage";
import { addUsage, extractDocument, extractPdfPages, inspectPdf, validateMagic } from "./extract";
import { advanceGeneration, planTasks } from "./generate";
import { RateLimitError } from "./groq";
import { verifyPhonetic } from "./phonetics";
import {
  assertGlobalCapacity,
  chargeColumns,
  chargeJob,
  creditStatus,
  lockUser,
  reserveCredits,
} from "./credits";

const MAX_TEXT = 180_000;
const PDF_PAGE_BATCH = 6;
const MAX_PDF_PAGES = 30;
const IMAGE_TYPES = new Set(["png", "jpg", "jpeg", "webp"]);
// Steps in a row whose OCR timed out without progress before the job gives up.
const MAX_STALLS = 5;
// Waiting this long on the provider's rate limit without any progress fails the job (e.g. the
// shared key's daily quota is spent).
const MAX_THROTTLE_MS = 600_000;
// Bump when generation changes enough that cached results should no longer be reused.
const CACHE_VERSION = 2;

export type StepResult = {
  status: string;
  stage: GenerationStage;
  completed?: number;
  total?: number;
  result?: GenerateResult | null;
  errorCode?: string | null;
  retryAfterMs?: number;
  /** 1-based place in the shared queue while the job waits for a provider slot. */
  queuePosition?: number;
  estimate?: CreditEstimate;
  creditsCharged?: number;
  refunded?: boolean;
};
export type Job = typeof aiJobs.$inferSelect;
type Upload = typeof aiUploads.$inferSelect;
export type Owned = ReturnType<typeof and>;
export interface StepContext {
  db: Database;
  userId: string;
  job: Job;
  state: AiJobState;
  signal: AbortSignal;
  /** No new provider call starts after this. */
  launchUntil: number;
  /** In-flight provider calls are abandoned at this point so the state can still be saved. */
  deadline: number;
  /** Saves state under the step lease; throws LeaseLostError when the lease is gone. */
  persist: (status: string) => Promise<void>;
  /** Condition that the row is still active and leased by this step. */
  owned: Owned;
}
/** Another step took over the job, or it was cancelled, while this one ran. */
export class LeaseLostError extends Error {}

export const initialState = (): AiJobState => ({
  phase: "extract",
  texts: [],
  extractIndex: 0,
  pdfPageCursor: 0,
  pagesCounted: false,
  chunks: null,
  chunkIndex: 0,
  rawCards: [],
  usage: { input: 0, output: 0, cached: 0, cost: 0 },
});
/** Credits already earned by the work done before generating: pages the server OCR'd. */
const readingCredits = (state: AiJobState) => (state.ocrPages ?? 0) * OCR_CREDITS_PER_PAGE;

function loadUploads(db: Database, userId: string, ids: string[]) {
  return ids.length
    ? db
        .select()
        .from(aiUploads)
        .where(
          and(
            inArray(aiUploads.id, ids),
            eq(aiUploads.userId, userId),
            gt(aiUploads.expiresAt, new Date()),
          ),
        )
    : Promise.resolve([] as Upload[]);
}
const isTimeout = (error: unknown) => error instanceof ApiError && error.code === "AI_TIMEOUT";
/** Records time spent waiting on the provider; progress resets it (see advanceGeneration). */
function noteThrottle(state: AiJobState, retryAfterMs: number) {
  state.throttledMs = (state.throttledMs ?? 0) + retryAfterMs;
  if (state.throttledMs > MAX_THROTTLE_MS) throw new ApiError(429, "RATE_LIMITED");
}

/**
 * Checks every file before any provider call: page and OCR limits, whether the user can afford
 * the OCR, and whether an identical request already has a cached result.
 */
async function inspectUploads(
  ctx: StepContext,
  uploads: Upload[],
  bytesOf: (upload: Upload) => Promise<Buffer>,
) {
  const { db, userId, job, state } = ctx;
  let totalPages = 0,
    ocrPages = 0;
  const hashes: string[] = [];
  for (const upload of uploads) {
    const bytes = await bytesOf(upload);
    const ext = validateMagic(bytes, upload.name, upload.mime);
    hashes.push(createHash("sha256").update(bytes).digest("hex"));
    if (ext === "pdf") {
      const pdf = await inspectPdf(bytes);
      totalPages += pdf.pages;
      ocrPages += pdf.scannedPages;
    } else if (IMAGE_TYPES.has(ext)) ocrPages++;
  }
  if (totalPages > MAX_PDF_PAGES) throw new ApiError(400, "PDF_PAGE_LIMIT");
  if (ocrPages > MAX_OCR_PAGES) throw new ApiError(400, "OCR_PAGE_LIMIT");
  const ocrCredits = ocrPages * OCR_CREDITS_PER_PAGE;
  if (ocrCredits) {
    if (ocrCredits > (await creditStatus(db, userId)).available)
      throw new ApiError(402, "AI_CREDITS_EXCEEDED");
    await assertGlobalCapacity(db, ocrPages * OCR_TOKENS_PER_PAGE);
  }
  state.pagesCounted = true;
  // Prompt-only requests are not cached: asking again should give fresh cards.
  if (!uploads.length) return false;
  state.cacheKey = createHash("sha256")
    .update(JSON.stringify({ v: CACHE_VERSION, hashes, prompt: job.prompt, options: job.options }))
    .digest("hex");
  const [hit] = await db
    .select()
    .from(aiResultCache)
    .where(eq(aiResultCache.key, state.cacheKey))
    .limit(1);
  if (!hit) return false;
  state.rawCards = generationResultSchema.parse(hit.result).cards.map((card) => ({
    term: card.term,
    definition: card.definition,
    phonetic: card.phonetic ?? "",
  }));
  state.cached = true;
  state.phase = "finalize";
  return true;
}

/** Reads uploaded files into `state.texts`, then prices the generation (or imports directly). */
export async function extractStep(ctx: StepContext): Promise<StepResult> {
  const { db, userId, job, state, signal } = ctx;
  const ids = z.array(z.uuid()).parse(job.uploadIds);
  const uploads = await loadUploads(db, userId, ids);
  if (uploads.length !== ids.length) throw new ApiError(400, "UPLOAD_MISSING");
  // Each file is downloaded at most once per step.
  const downloads = new Map<string, Buffer>();
  const bytesOf = async (upload: Upload) => {
    const bytes = downloads.get(upload.id) ?? (await getUpload(upload.key, upload.size, signal));
    downloads.set(upload.id, bytes);
    return bytes;
  };
  if (!state.pagesCounted && (await inspectUploads(ctx, uploads, bytesOf))) {
    await ctx.persist("validating");
    return { status: "validating", stage: "validating" };
  }
  const pause = async (retryAfterMs: number): Promise<StepResult> => {
    await ctx.persist("extracting");
    return { status: "extracting", stage: "reading", retryAfterMs };
  };
  while (state.extractIndex < uploads.length) {
    signal.throwIfAborted();
    if (Date.now() > ctx.launchUntil) return pause(0);
    const upload = uploads[state.extractIndex];
    const bytes = await bytesOf(upload);
    try {
      if (validateMagic(bytes, upload.name, upload.mime) === "pdf") {
        const from = state.pdfPageCursor || 1;
        const range = await extractPdfPages(bytes, from, PDF_PAGE_BATCH, signal, ctx.deadline);
        state.texts[state.extractIndex] = (state.texts[state.extractIndex] ?? "") + range.text;
        addUsage(state.usage, range.usage);
        state.ocrPages = (state.ocrPages ?? 0) + range.ocrPages;
        if (range.nextPage !== from) state.throttledMs = 0;
        if (range.retryAfterMs !== undefined) {
          state.pdfPageCursor = range.nextPage;
          // 0 means a page timed out rather than being throttled.
          if (range.retryAfterMs) noteThrottle(state, range.retryAfterMs);
          else {
            state.stalls = range.nextPage === from ? (state.stalls ?? 0) + 1 : 0;
            if (state.stalls > MAX_STALLS) throw new ApiError(504, "AI_TIMEOUT");
          }
          return pause(range.retryAfterMs);
        }
        state.pdfPageCursor = range.nextPage;
        if (range.nextPage === 0) state.extractIndex++;
      } else {
        const doc = await extractDocument(bytes, upload.name, upload.mime, signal, ctx.deadline);
        state.texts[state.extractIndex] = doc.text;
        addUsage(state.usage, doc.usage);
        state.ocrPages = (state.ocrPages ?? 0) + doc.ocrPages;
        state.extractIndex++;
        state.pdfPageCursor = 0;
        state.throttledMs = 0;
      }
      state.stalls = 0;
    } catch (error) {
      if (error instanceof RateLimitError) {
        noteThrottle(state, error.retryAfterMs);
        return pause(error.retryAfterMs);
      }
      if (!isTimeout(error)) throw error;
      state.stalls = (state.stalls ?? 0) + 1;
      if (state.stalls > MAX_STALLS) throw new ApiError(504, "AI_TIMEOUT");
      return pause(0);
    }
  }
  return planGeneration(ctx, ids.length > 0);
}

/** After reading: import clear term/definition pairs for free, or price the AI generation. */
async function planGeneration(ctx: StepContext, hasFiles: boolean): Promise<StepResult> {
  const { db, userId, job, state } = ctx;
  const text = state.texts.join("\n\n");
  if (text.length > MAX_TEXT) throw new ApiError(400, "DOCUMENT_TOO_LONG");
  const parsed = parseAutoDetected(text);
  if (!job.prompt && hasFiles && parsed.cards.length >= 2 && parsed.invalidLines.length === 0) {
    state.rawCards = parsed.cards.map((card) => ({
      term: card.term,
      definition: card.definition,
      phonetic: "",
    }));
    state.phase = "finalize";
    await ctx.persist("validating");
    return { status: "validating", stage: "validating" };
  }
  const { cardCount } = generationOptionsSchema.parse(job.options);
  state.chunks = text ? splitDocument(text) : [""];
  state.chunkTokens = state.chunks.map(estimateTokens);
  state.chunkIndex = 0;
  state.tasks = planTasks(state.chunks.length, cardCount);
  state.totalTasks = state.tasks.length;
  state.phase = "generate";
  const credits = creditsForCards(cardCount);
  const total = readingCredits(state) + credits;
  // Small requests the free daily credits cover just run; anything else asks the user first.
  const quota = await creditStatus(db, userId);
  if (credits <= AUTO_CONFIRM_CREDITS && total <= quota.dailyRemaining - quota.reserved) {
    const reserved = await db
      .transaction(async (tx) => {
        await lockUser(tx, userId);
        await reserveCredits(
          tx,
          userId,
          job.id,
          total,
          estimateGenerationTokens(state.chunkTokens ?? [], cardCount),
        );
        return true;
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError) return false;
        throw error;
      });
    if (reserved) {
      await ctx.persist("generating");
      return { status: "generating", stage: "analyzing", completed: 0, total: state.totalTasks };
    }
  }
  await ctx.persist("awaiting");
  return awaitingResult(db, userId, state, cardCount);
}

/** The estimate shown to the user while a job waits for their go-ahead. */
export async function awaitingResult(
  db: Database,
  userId: string,
  state: AiJobState,
  cardCount: number,
): Promise<StepResult> {
  const chunkTokens = state.chunkTokens ?? (state.chunks ?? [""]).map(estimateTokens);
  return {
    status: "awaiting",
    stage: "analyzing",
    estimate: {
      credits: creditsForCards(cardCount),
      usedCredits: readingCredits(state),
      cardCount,
      chunkTokens,
      quota: await creditStatus(db, userId),
      maxJobCredits: MAX_JOB_CREDITS,
    },
  };
}

export async function generateStep(ctx: StepContext): Promise<StepResult> {
  const { state, job } = ctx;
  // Jobs planned before task tracking existed resume from their next unprocessed chunk.
  if (!state.tasks) {
    const chunks = state.chunks ?? [""];
    state.tasks = planTasks(
      chunks.length,
      generationOptionsSchema.parse(job.options).cardCount,
    ).filter((task) => task.chunk >= state.chunkIndex);
    state.totalTasks = state.tasks.length;
  }
  const progress = await advanceGeneration(
    state,
    job.prompt,
    generationOptionsSchema.parse(job.options),
    ctx.signal,
    { launchUntil: ctx.launchUntil, deadline: ctx.deadline },
  );
  if (!progress.done) {
    if (progress.retryAfterMs) noteThrottle(state, progress.retryAfterMs);
    await ctx.persist("generating");
    return {
      status: "generating",
      stage: "generating",
      completed: progress.completed,
      total: progress.total,
      ...(progress.retryAfterMs ? { retryAfterMs: progress.retryAfterMs } : {}),
    };
  }
  state.phase = "finalize";
  await ctx.persist("validating");
  return {
    status: "validating",
    stage: "validating",
    completed: state.totalTasks,
    total: state.totalTasks,
  };
}

/**
 * Completes the job and charges for the cards it produced (and pages the server OCR'd). Returns null when the job was cancelled or
 * taken over meanwhile, so the caller reports the job's real state instead.
 */
export async function finalizeStep({
  db,
  userId,
  job,
  state,
  signal,
  owned,
}: StepContext): Promise<StepResult | null> {
  signal.throwIfAborted();
  const options = generationOptionsSchema.parse(job.options);
  const cards = normalizeCards(state.rawCards, options.cardCount, v7).map((card) => ({
    ...card,
    phonetic: options.includePhonetic
      ? verifyPhonetic(card.term, options.termLang, card.phonetic ?? "")
      : "",
  }));
  const result = generationResultSchema.parse({
    cards,
    usedSamples: false,
    unreadFiles: [],
    ...(state.failedTasks
      ? { skippedParts: state.failedTasks, totalParts: state.totalTasks ?? state.failedTasks }
      : {}),
  });
  return db
    .transaction(async (tx) => {
      await lockUser(tx, userId);
      signal.throwIfAborted();
      const cost = jobCredits({
        ocrPages: state.ocrPages,
        cards: cards.length,
        cached: state.cached,
      });
      const charge = await chargeJob(tx, userId, job.id, cost, false);
      // Conditional completion ensures a concurrent cancellation is never charged twice.
      const updated = await tx
        .update(aiJobs)
        .set({
          status: "done",
          result,
          state: null,
          finishedAt: new Date(),
          model: getServerEnv().GROQ_TEXT_MODEL,
          inputTokens: state.usage.input,
          outputTokens: state.usage.output,
          cacheReadTokens: state.usage.cached,
          costUsd: state.usage.cost.toFixed(8),
          ...chargeColumns(charge),
        })
        .where(owned)
        .returning({ id: aiJobs.id });
      // Cancelled or taken over meanwhile: undo the ledger entry chargeJob may have written.
      if (!updated.length) tx.rollback();
      // Only complete results of real documents are worth reusing.
      if (state.cacheKey && !state.cached && !state.failedTasks)
        await tx
          .insert(aiResultCache)
          .values({ key: state.cacheKey, result })
          .onConflictDoNothing();
      return {
        status: "done",
        stage: "done" as const,
        result,
        creditsCharged: charge.credits,
        refunded: false,
      };
    })
    .catch((error: unknown) => {
      if (isRollback(error)) return null;
      throw error;
    });
}
const isRollback = (error: unknown) => error instanceof TransactionRollbackError;

/**
 * Records a failed job. Credits are refunded when the system is at fault; otherwise pages the
 * server already OCR'd (before the document turned out unusable) are charged.
 */
export async function failJob(
  db: Database,
  userId: string,
  jobId: string,
  owned: Owned,
  state: AiJobState | null,
  error: unknown,
): Promise<StepResult> {
  const code =
    error instanceof ApiError
      ? error.code
      : error instanceof z.ZodError
        ? "AI_INVALID_OUTPUT"
        : "INTERNAL";
  if (code === "INTERNAL")
    console.error("AI job step failed", { jobId, phase: state?.phase, error });
  const refund = SYSTEM_ERROR_CODES.has(code);
  const charge = await db
    .transaction(async (tx) => {
      await lockUser(tx, userId);
      // No cards were delivered; only pages the server OCR'd are charged.
      const cost = state ? readingCredits(state) : 0;
      const result = await chargeJob(tx, userId, jobId, cost, refund);
      const updated = await tx
        .update(aiJobs)
        .set({
          status: "error",
          errorCode: code,
          finishedAt: new Date(),
          ...(state
            ? {
                inputTokens: state.usage.input,
                outputTokens: state.usage.output,
                costUsd: state.usage.cost.toFixed(8),
              }
            : {}),
          ...chargeColumns(result),
        })
        .where(owned)
        .returning({ id: aiJobs.id });
      if (!updated.length) tx.rollback();
      return result;
    })
    .catch((rollback: unknown) => {
      if (isRollback(rollback)) return { credits: 0, daily: 0, refunded: refund };
      throw rollback;
    });
  return {
    status: "error",
    stage: "done",
    errorCode: code,
    creditsCharged: charge.credits,
    refunded: charge.refunded,
  };
}
