import "server-only";
import { and, eq, gt, gte, inArray, lt, sql, desc } from "drizzle-orm";
import { v7 } from "uuid";
import { z } from "zod";
import {
  jobInputSchema,
  generationOptionsSchema,
  generationResultSchema,
  aiJobStateSchema,
  type AiJobState,
} from "@/features/ai-generate/schemas";
import { normalizeCards, splitDocument } from "@/features/ai-generate/lib/output";
import { parseAutoDetected } from "@/features/sets/lib/import-parser";
import type { GenerationStage, GenerateResult } from "@/features/ai-generate/lib/generator";
import { ApiError } from "../api-error";
import type { Database } from "../db/client";
import { aiJobs, aiUploads, user } from "../db/schema";
import { getUpload } from "./storage";
import {
  addUsage,
  extractDocument,
  extractPdfPages,
  countPdfPages,
  validateMagic,
} from "./extract";
import { advanceGeneration, planTasks } from "./generate";
import { RateLimitError } from "./groq";
import { getServerEnv } from "../env";

const DAILY_LIMIT = 5;
const MAX_TEXT = 180_000;
// Each step does a bounded slice of work so a single serverless invocation stays well under the
// 60s limit on Vercel's free plan; the browser keeps calling until the job reaches a terminal state.
// New provider calls start only within the launch budget; in-flight ones are cut at the hard budget.
// The gap between the two (18s) is the least time any provider call gets before it is cut.
const STEP_LAUNCH_BUDGET_MS = 30_000;
const STEP_HARD_BUDGET_MS = 48_000;
const PDF_PAGE_BATCH = 6;
const MAX_PDF_PAGES = 30;
// Steps in a row whose OCR timed out without progress before the job gives up.
const MAX_STALLS = 5;
// Waiting this long on the provider's rate limit without any progress fails the job (e.g. the
// shared key's daily quota is spent).
const MAX_THROTTLE_MS = 600_000;
// A job whose browser has not called in this long is treated as abandoned by the queue.
const HEARTBEAT_STALE_MS = 120_000;
// An unfinished job untouched for this long releases its quota reservation.
const ABANDONED_JOB_MS = 600_000;
const QUEUE_POLL_MS = 3_000;
const activeStatuses = ["queued", "extracting", "generating", "validating"];
const lastSeen = sql`coalesce(${aiJobs.heartbeatAt}, ${aiJobs.createdAt})`;
/** Database time `ms` milliseconds ago, comparable with timestamp expressions such as lastSeen. */
const ago = (ms: number) => sql`now() - make_interval(secs => ${ms / 1000})`;
export function quotaWindow(now = new Date()) {
  const shifted = new Date(now.getTime() + 7 * 3600_000);
  const day = shifted.toISOString().slice(0, 10);
  const start = new Date(`${day}T00:00:00+07:00`);
  return { start, reset: new Date(start.getTime() + 86400_000), day };
}
export async function getQuota(db: Database, userId: string) {
  const { start, reset } = quotaWindow();
  const [row] = await db
    .select({ used: sql<number>`count(*)::int` })
    .from(aiJobs)
    .where(
      and(
        eq(aiJobs.userId, userId),
        eq(aiJobs.status, "done"),
        gte(aiJobs.finishedAt, start),
        lt(aiJobs.finishedAt, reset),
      ),
    );
  return {
    remaining: Math.max(0, DAILY_LIMIT - row.used),
    limit: DAILY_LIMIT,
    resetsAt: reset.toISOString(),
  };
}
export async function createJob(db: Database, userId: string, input: unknown) {
  if (getServerEnv().AI_ENABLED === "false") throw new ApiError(503, "AI_UNAVAILABLE");
  const data = jobInputSchema.parse(input);
  if (new Set(data.uploadIds).size !== data.uploadIds.length)
    throw new ApiError(400, "VALIDATION_ERROR");
  return db.transaction(async (tx) => {
    await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
    // An abandoned queued/in-progress job releases its reservation after ten minutes without
    // activity. Waiting in the shared queue keeps the heartbeat fresh, so it does not count.
    await tx
      .update(aiJobs)
      .set({ status: "error", errorCode: "AI_TIMEOUT", finishedAt: new Date() })
      .where(
        and(
          eq(aiJobs.userId, userId),
          inArray(aiJobs.status, activeStatuses),
          lt(lastSeen, ago(ABANDONED_JOB_MS)),
        ),
      );
    const { start, reset } = quotaWindow();
    const [used] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(aiJobs)
      .where(
        and(
          eq(aiJobs.userId, userId),
          sql`(${inArray(aiJobs.status, activeStatuses)} OR (${eq(aiJobs.status, "done")} AND ${gte(aiJobs.finishedAt, start)} AND ${lt(aiJobs.finishedAt, reset)}))`,
        ),
      );
    if (used.count >= DAILY_LIMIT) throw new ApiError(429, "AI_QUOTA_EXCEEDED");
    const uploads = data.uploadIds.length
      ? await tx
          .select()
          .from(aiUploads)
          .where(
            and(
              inArray(aiUploads.id, data.uploadIds),
              eq(aiUploads.userId, userId),
              gt(aiUploads.expiresAt, new Date()),
            ),
          )
      : [];
    if (uploads.length !== data.uploadIds.length) throw new ApiError(404, "NOT_FOUND");
    const id = v7();
    await tx.insert(aiJobs).values({
      id,
      userId,
      prompt: data.prompt,
      options: data.options,
      uploadIds: data.uploadIds,
    });
    return { jobId: id };
  });
}
export async function requireJob(db: Database, userId: string, id: string) {
  z.uuid().parse(id);
  const [job] = await db
    .select()
    .from(aiJobs)
    .where(
      and(
        eq(aiJobs.id, id),
        eq(aiJobs.userId, userId),
        gt(aiJobs.createdAt, new Date(Date.now() - 86400_000)),
      ),
    )
    .limit(1);
  if (!job) throw new ApiError(404, "NOT_FOUND");
  return job;
}
export async function listJobs(db: Database, userId: string, limit = 10) {
  return (
    await db
      .select()
      .from(aiJobs)
      .where(and(eq(aiJobs.userId, userId), gt(aiJobs.createdAt, new Date(Date.now() - 86400_000))))
      .orderBy(desc(aiJobs.createdAt))
      .limit(Math.min(50, limit))
  ).map((job) => ({
    id: job.id,
    status: job.status,
    prompt: job.prompt,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
    options: generationOptionsSchema.parse(job.options),
    result: job.result ? generationResultSchema.parse(job.result) : null,
    errorCode: job.errorCode,
  }));
}
export async function cancelJob(db: Database, userId: string, id: string) {
  await requireJob(db, userId, id);
  await db
    .update(aiJobs)
    .set({ status: "cancelled", finishedAt: new Date() })
    .where(
      and(eq(aiJobs.id, id), eq(aiJobs.userId, userId), inArray(aiJobs.status, activeStatuses)),
    );
}
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
};
type Job = typeof aiJobs.$inferSelect;
type Upload = typeof aiUploads.$inferSelect;
interface StepContext {
  db: Database;
  userId: string;
  job: Job;
  state: AiJobState;
  signal: AbortSignal;
  /** No new provider call starts after this. */
  launchUntil: number;
  /** In-flight provider calls are abandoned at this point so the state can still be saved. */
  deadline: number;
  persist: (status: string) => Promise<unknown>;
}

const initialState = (): AiJobState => ({
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

/** Reads uploaded files into `state.texts`, then plans generation (or a direct import). */
async function extractStep(ctx: StepContext): Promise<StepResult> {
  const { db, userId, job, state, signal } = ctx;
  const ids = z.array(z.uuid()).parse(job.uploadIds);
  const uploads = await loadUploads(db, userId, ids);
  if (uploads.length !== ids.length) throw new ApiError(400, "UPLOAD_MISSING");
  // Each file is downloaded at most once per step.
  const cache = new Map<string, Buffer>();
  const bytesOf = async (upload: Upload) => {
    const bytes = cache.get(upload.id) ?? (await getUpload(upload.key, upload.size, signal));
    cache.set(upload.id, bytes);
    return bytes;
  };
  // One-time total page check mirrors the pre-OCR guard across a multi-file job.
  if (!state.pagesCounted) {
    let totalPages = 0;
    for (const upload of uploads) {
      const bytes = await bytesOf(upload);
      if (validateMagic(bytes, upload.name, upload.mime) === "pdf")
        totalPages += await countPdfPages(bytes);
    }
    if (totalPages > MAX_PDF_PAGES) throw new ApiError(400, "PDF_PAGE_LIMIT");
    state.pagesCounted = true;
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

  // Extraction complete: decide between a direct import and model generation.
  const text = state.texts.join("\n\n");
  if (text.length > MAX_TEXT) throw new ApiError(400, "DOCUMENT_TOO_LONG");
  const parsed = parseAutoDetected(text);
  if (!job.prompt && ids.length && parsed.cards.length >= 2 && parsed.invalidLines.length === 0) {
    state.rawCards = parsed.cards.map((card) => ({
      term: card.term,
      definition: card.definition,
      phonetic: "",
    }));
    state.phase = "finalize";
    await ctx.persist("validating");
    return { status: "validating", stage: "validating" };
  }
  const options = generationOptionsSchema.parse(job.options);
  state.chunks = text ? splitDocument(text) : [""];
  state.chunkIndex = 0;
  state.tasks = planTasks(state.chunks.length, options.cardCount);
  state.totalTasks = state.tasks.length;
  state.phase = "generate";
  await ctx.persist("generating");
  return { status: "generating", stage: "analyzing", completed: 0, total: state.totalTasks };
}

async function generateStep(ctx: StepContext): Promise<StepResult> {
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

async function finalizeStep({ db, userId, job, state, signal }: StepContext): Promise<StepResult> {
  signal.throwIfAborted();
  const options = generationOptionsSchema.parse(job.options);
  const cards = normalizeCards(state.rawCards, options.cardCount, v7);
  const result = generationResultSchema.parse({ cards, usedSamples: false, unreadFiles: [] });
  // Conditional completion ensures a concurrent cancellation never consumes quota.
  const completed = await db.transaction(async (tx) => {
    await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
    signal.throwIfAborted();
    const { start, reset } = quotaWindow();
    const [daily] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(aiJobs)
      .where(
        and(
          eq(aiJobs.userId, userId),
          eq(aiJobs.status, "done"),
          gte(aiJobs.finishedAt, start),
          lt(aiJobs.finishedAt, reset),
        ),
      );
    if (daily.count >= DAILY_LIMIT) throw new ApiError(429, "AI_QUOTA_EXCEEDED");
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
      })
      .where(and(eq(aiJobs.id, job.id), inArray(aiJobs.status, activeStatuses)))
      .returning({ id: aiJobs.id });
    return updated.length > 0;
  });
  // Cancelled meanwhile, or a duplicate step finished first: report what actually happened.
  if (!completed) return terminalResult(await requireJob(db, userId, job.id));
  return { status: "done", stage: "done", result };
}

/** Claims a queued job or loads the saved state of one in progress. */
async function loadState(
  db: Database,
  userId: string,
  job: Job,
): Promise<{ state: AiJobState } | { terminal: Job }> {
  if (job.status !== "queued") return { state: aiJobStateSchema.parse(job.state) };
  const claimed = await db
    .update(aiJobs)
    .set({ status: "extracting", state: initialState() })
    .where(and(eq(aiJobs.id, job.id), eq(aiJobs.status, "queued")))
    .returning({ id: aiJobs.id });
  if (claimed.length) return { state: initialState() };
  const fresh = await requireJob(db, userId, job.id);
  if (!activeStatuses.includes(fresh.status)) return { terminal: fresh };
  return { state: aiJobStateSchema.parse(fresh.state) };
}
/**
 * Number of live jobs (any user) created before this one that are still unfinished. Jobs run in
 * creation order; only the first AI_MAX_ACTIVE_JOBS may call the shared provider key.
 */
async function jobsAhead(db: Database, job: Job) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aiJobs)
    .where(
      and(
        inArray(aiJobs.status, activeStatuses),
        lt(aiJobs.id, job.id),
        gt(lastSeen, ago(HEARTBEAT_STALE_MS)),
      ),
    );
  return row.count;
}
const terminalResult = (job: Job): StepResult =>
  job.status === "done"
    ? { status: "done", stage: "done", result: generationResultSchema.parse(job.result) }
    : { status: job.status, stage: "done", errorCode: job.errorCode ?? "AI_CANCELLED" };

/**
 * Advances a generation job by one bounded slice of work and persists its state. The caller
 * repeats this until `status` is terminal (`done` / `error` / `cancelled`), waiting
 * `retryAfterMs` first when the provider throttled the job. This keeps every invocation short
 * enough for a serverless runtime with a strict per-request time limit.
 */
export async function stepJob(
  db: Database,
  userId: string,
  id: string,
  signal: AbortSignal,
): Promise<StepResult> {
  const startedAt = Date.now();
  const job = await requireJob(db, userId, id);
  if (!activeStatuses.includes(job.status)) return terminalResult(job);
  await db.update(aiJobs).set({ heartbeatAt: new Date() }).where(eq(aiJobs.id, id));
  // Once claimed a job keeps its slot; only unclaimed jobs wait for one.
  if (job.status === "queued") {
    const ahead = await jobsAhead(db, job);
    const slots = getServerEnv().AI_MAX_ACTIVE_JOBS;
    if (ahead >= slots)
      return {
        status: "queued",
        stage: "queued",
        queuePosition: ahead - slots + 1,
        retryAfterMs: QUEUE_POLL_MS,
      };
  }
  const loaded = await loadState(db, userId, job);
  if ("terminal" in loaded) return terminalResult(loaded.terminal);
  const { state } = loaded;
  const phase = state.phase;
  const ctx: StepContext = {
    db,
    userId,
    job,
    state,
    signal,
    launchUntil: startedAt + STEP_LAUNCH_BUDGET_MS,
    deadline: startedAt + STEP_HARD_BUDGET_MS,
    persist: (status) =>
      db
        .update(aiJobs)
        .set({ state, status })
        .where(and(eq(aiJobs.id, id), inArray(aiJobs.status, activeStatuses))),
  };
  let outcome: StepResult;
  try {
    outcome =
      state.phase === "extract"
        ? await extractStep(ctx)
        : state.phase === "generate"
          ? await generateStep(ctx)
          : await finalizeStep(ctx);
  } catch (error) {
    // The browser went away (closed tab, dropped connection). Leave the job resumable from its
    // last saved state; an explicit cancel is recorded by cancelJob.
    if (signal.aborted) return { status: job.status, stage: "done", errorCode: "AI_CANCELLED" };
    const code =
      error instanceof ApiError
        ? error.code
        : error instanceof z.ZodError
          ? "AI_INVALID_OUTPUT"
          : "INTERNAL";
    if (code === "INTERNAL") console.error("AI job step failed", { jobId: id, phase, error });
    await db
      .update(aiJobs)
      .set({
        status: "error",
        errorCode: code,
        finishedAt: new Date(),
        inputTokens: state.usage.input,
        outputTokens: state.usage.output,
        costUsd: state.usage.cost.toFixed(8),
      })
      .where(and(eq(aiJobs.id, id), inArray(aiJobs.status, activeStatuses)));
    outcome = { status: "error", stage: "done", errorCode: code };
  }
  // Durations only; never log document text or provider bodies.
  console.info("AI job step", {
    jobId: id,
    phase,
    status: outcome.status,
    ms: Date.now() - startedAt,
    retryAfterMs: outcome.retryAfterMs,
    errorCode: outcome.errorCode,
  });
  return outcome;
}
