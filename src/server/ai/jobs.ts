import "server-only";
import { and, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { v7 } from "uuid";
import { z } from "zod";
import {
  aiJobStateSchema,
  generationOptionsSchema,
  generationResultSchema,
  jobInputSchema,
  type AiJobState,
} from "@/features/ai-generate/schemas";
import {
  CARD_COUNT_MAX,
  CARD_COUNT_MIN,
  type GenerationStage,
} from "@/features/ai-generate/lib/generator";
import {
  SYSTEM_ERROR_CODES,
  creditsForTokens,
  estimateGenerationCredits,
} from "@/features/ai-generate/lib/credits";
import { ApiError } from "../api-error";
import type { Database } from "../db/client";
import { aiJobs, aiUploads } from "../db/schema";
import { getServerEnv } from "../env";
import {
  ACTIVE_JOB_STATUSES,
  assertGlobalCapacity,
  chargeColumns,
  chargeJob,
  creditStatus,
  lockUser,
  reserveCredits,
} from "./credits";
import {
  LeaseLostError,
  awaitingResult,
  extractStep,
  failJob,
  finalizeStep,
  generateStep,
  initialState,
  type Job,
  type Owned,
  type StepContext,
  type StepResult,
} from "./job-steps";
import { planTasks } from "./generate";

export { quotaWindow } from "./credits";
export type { StepResult } from "./job-steps";

// Each step does a bounded slice of work so a single serverless invocation stays well under the
// 60s limit on Vercel's free plan; the browser keeps calling until the job reaches a terminal state.
// New provider calls start only within the launch budget; in-flight ones are cut at the hard budget.
// The gap between the two (18s) is the least time any provider call gets before it is cut.
const STEP_LAUNCH_BUDGET_MS = 30_000;
const STEP_HARD_BUDGET_MS = 48_000;
// A job whose browser has not called in this long is treated as abandoned by the queue.
const HEARTBEAT_STALE_MS = 120_000;
// A job still waiting for a slot is polled every few seconds by its browser; one that stopped
// polling (tab closed, never started) must not hold up everyone behind it for long.
const QUEUED_STALE_MS = 15_000;
// An unfinished job untouched for this long releases its credit reservation.
const ABANDONED_JOB_MS = 600_000;
const QUEUE_POLL_MS = 3_000;
// Outlives the 60s function limit, so a lease left by a killed invocation frees itself.
const STEP_LEASE_MS = 65_000;
const BUSY_POLL_MS = 2_000;
/** Generations one person may have running (or awaiting their go-ahead) at once. */
const MAX_OPEN_JOBS_PER_USER = 2;
const activeStatuses = ACTIVE_JOB_STATUSES;
const openStatuses = [...ACTIVE_JOB_STATUSES, "awaiting"];
const lastSeen = sql`coalesce(${aiJobs.heartbeatAt}, ${aiJobs.createdAt})`;
/** Database time `ms` milliseconds ago, comparable with timestamp expressions such as lastSeen. */
const ago = (ms: number) => sql`now() - make_interval(secs => ${ms / 1000})`;

export const getQuota = creditStatus;

export async function createJob(db: Database, userId: string, input: unknown) {
  if (getServerEnv().AI_ENABLED === "false") throw new ApiError(503, "AI_UNAVAILABLE");
  const data = jobInputSchema.parse(input);
  if (new Set(data.uploadIds).size !== data.uploadIds.length)
    throw new ApiError(400, "VALIDATION_ERROR");
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    // A job left without activity for ten minutes is abandoned: it ends as a timeout (a system
    // failure, so nothing is charged) and releases its reservation. Waiting in the shared queue
    // keeps the heartbeat fresh, so it does not count.
    await tx
      .update(aiJobs)
      .set({ status: "error", errorCode: "AI_TIMEOUT", finishedAt: new Date(), creditsReserved: 0 })
      .where(
        and(
          eq(aiJobs.userId, userId),
          inArray(aiJobs.status, openStatuses),
          lt(lastSeen, ago(ABANDONED_JOB_MS)),
        ),
      );
    const [open] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(aiJobs)
      .where(and(eq(aiJobs.userId, userId), inArray(aiJobs.status, openStatuses)));
    if (open.count >= MAX_OPEN_JOBS_PER_USER) throw new ApiError(429, "AI_BUSY");
    if ((await creditStatus(tx, userId)).available < 1)
      throw new ApiError(402, "AI_CREDITS_EXCEEDED");
    await assertGlobalCapacity(tx, 1);
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
    creditsCharged: job.creditsCharged,
  }));
}
/** Stops a job at the user's request; the tokens it already spent are charged. */
export async function cancelJob(db: Database, userId: string, id: string) {
  await requireJob(db, userId, id);
  await db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const [job] = await tx
      .select()
      .from(aiJobs)
      .where(and(eq(aiJobs.id, id), inArray(aiJobs.status, openStatuses)));
    if (!job) return;
    const state = aiJobStateSchema.safeParse(job.state).data;
    const tokens = state && !state.cached ? state.usage.input + state.usage.output : 0;
    const charge = await chargeJob(tx, userId, id, tokens, false);
    await tx
      .update(aiJobs)
      .set({
        status: "cancelled",
        finishedAt: new Date(),
        ...(state ? { inputTokens: state.usage.input, outputTokens: state.usage.output } : {}),
        ...chargeColumns(charge),
      })
      .where(eq(aiJobs.id, id));
  });
}

const confirmSchema = z.object({
  cardCount: z.number().int().min(CARD_COUNT_MIN).max(CARD_COUNT_MAX).optional(),
});
/**
 * The user accepted the estimate (optionally for a different number of cards): reserve the
 * credits and put the job back in the queue to generate.
 */
export async function confirmJob(db: Database, userId: string, id: string, input: unknown) {
  const { cardCount } = confirmSchema.parse(input);
  await requireJob(db, userId, id);
  await db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const [job] = await tx.select().from(aiJobs).where(eq(aiJobs.id, id));
    if (job.status !== "awaiting") throw new ApiError(409, "CONFLICT");
    const state = aiJobStateSchema.parse(job.state);
    const options = generationOptionsSchema.parse(job.options);
    const count = cardCount ?? options.cardCount;
    const chunks = state.chunks ?? [""];
    state.tasks = planTasks(chunks.length, count);
    state.totalTasks = state.tasks.length;
    const generation = estimateGenerationCredits(state.chunkTokens ?? [], count);
    const used = creditsForTokens(state.cached ? 0 : state.usage.input + state.usage.output);
    await reserveCredits(tx, userId, id, used + generation);
    await tx
      .update(aiJobs)
      .set({ status: "queued", state, options: { ...options, cardCount: count } })
      .where(eq(aiJobs.id, id));
  });
}

/** Claims a queued job, keeping the state of one that was paused for confirmation. */
async function loadState(db: Database, job: Job, owned: Owned) {
  if (job.status !== "queued") return aiJobStateSchema.parse(job.state);
  const state = job.state ? aiJobStateSchema.parse(job.state) : initialState();
  const claimed = await db
    .update(aiJobs)
    .set({ status: state.phase === "extract" ? "extracting" : "generating", state })
    .where(owned)
    .returning({ id: aiJobs.id });
  if (!claimed.length) throw new LeaseLostError();
  return state;
}
/**
 * Takes the job's step lease and records the browser's heartbeat. Returns null when another step
 * for the same job is still running.
 */
async function acquireLease(db: Database, id: string) {
  const token = v7();
  const [leased] = await db
    .update(aiJobs)
    .set({
      heartbeatAt: new Date(),
      stepLease: token,
      stepLeaseUntil: sql`now() + make_interval(secs => ${STEP_LEASE_MS / 1000})`,
    })
    .where(
      and(
        eq(aiJobs.id, id),
        inArray(aiJobs.status, activeStatuses),
        sql`(${aiJobs.stepLeaseUntil} is null or ${aiJobs.stepLeaseUntil} < now())`,
      ),
    )
    .returning();
  if (leased) return { token, job: leased };
  await db.update(aiJobs).set({ heartbeatAt: new Date() }).where(eq(aiJobs.id, id));
  return null;
}
const releaseLease = (db: Database, id: string, token: string) =>
  db
    .update(aiJobs)
    .set({ stepLease: null, stepLeaseUntil: null })
    .where(and(eq(aiJobs.id, id), eq(aiJobs.stepLease, token)));
const STAGE_OF_STATUS: Record<string, GenerationStage> = {
  queued: "queued",
  extracting: "reading",
  generating: "generating",
  validating: "validating",
};
/** What a step reports when it could not do work itself: the job's outcome, or "try again". */
async function currentResult(db: Database, userId: string, id: string): Promise<StepResult> {
  const job = await requireJob(db, userId, id);
  if (job.status === "awaiting")
    return awaitingResult(
      db,
      userId,
      aiJobStateSchema.parse(job.state),
      generationOptionsSchema.parse(job.options).cardCount,
    );
  return activeStatuses.includes(job.status)
    ? { status: job.status, stage: STAGE_OF_STATUS[job.status], retryAfterMs: BUSY_POLL_MS }
    : terminalResult(job);
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
        lt(aiJobs.id, job.id),
        or(
          and(eq(aiJobs.status, "queued"), gt(lastSeen, ago(QUEUED_STALE_MS))),
          and(
            inArray(aiJobs.status, ["extracting", "generating", "validating"]),
            gt(lastSeen, ago(HEARTBEAT_STALE_MS)),
          ),
        ),
      ),
    );
  return row.count;
}
function terminalResult(job: Job): StepResult {
  const credits = { creditsCharged: job.creditsCharged };
  if (job.status === "done")
    return {
      status: "done",
      stage: "done",
      result: generationResultSchema.parse(job.result),
      ...credits,
      refunded: false,
    };
  const errorCode = job.errorCode ?? "AI_CANCELLED";
  return {
    status: job.status,
    stage: "done",
    errorCode,
    ...credits,
    refunded: job.status === "error" && SYSTEM_ERROR_CODES.has(errorCode),
  };
}

/** Runs the job's current phase under a held lease; null means the lease was lost. */
async function runStep(
  db: Database,
  userId: string,
  job: Job,
  signal: AbortSignal,
  startedAt: number,
  owned: Owned,
  onLoaded: (state: AiJobState) => void,
): Promise<StepResult | null> {
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
  const state = await loadState(db, job, owned);
  onLoaded(state);
  const ctx: StepContext = {
    db,
    userId,
    job,
    state,
    signal,
    owned,
    launchUntil: startedAt + STEP_LAUNCH_BUDGET_MS,
    deadline: startedAt + STEP_HARD_BUDGET_MS,
    persist: async (status) => {
      const saved = await db
        .update(aiJobs)
        .set({ state, status })
        .where(owned)
        .returning({ id: aiJobs.id });
      if (!saved.length) throw new LeaseLostError();
    },
  };
  return state.phase === "extract"
    ? extractStep(ctx)
    : state.phase === "generate"
      ? generateStep(ctx)
      : finalizeStep(ctx);
}

/**
 * Advances a generation job by one bounded slice of work and persists its state. The caller
 * repeats this until `status` is terminal (`done` / `error` / `cancelled`), waiting
 * `retryAfterMs` first when the job is queued or throttled, and confirming the estimate when the
 * job is `awaiting`. This keeps every invocation short enough for a serverless runtime with a
 * strict per-request time limit.
 */
export async function stepJob(
  db: Database,
  userId: string,
  id: string,
  signal: AbortSignal,
): Promise<StepResult> {
  const startedAt = Date.now();
  const existing = await requireJob(db, userId, id);
  if (!activeStatuses.includes(existing.status)) return currentResult(db, userId, id);
  const lease = await acquireLease(db, id);
  if (!lease) return currentResult(db, userId, id);
  const { token, job } = lease;
  const owned = and(
    eq(aiJobs.id, id),
    eq(aiJobs.stepLease, token),
    inArray(aiJobs.status, activeStatuses),
  );
  let outcome: StepResult | null;
  let state: AiJobState | null = null;
  try {
    outcome = await runStep(db, userId, job, signal, startedAt, owned, (loaded) => {
      state = loaded;
    });
  } catch (error) {
    if (error instanceof LeaseLostError) outcome = null;
    // The browser went away (closed tab, dropped connection). Leave the job resumable from its
    // last saved state; an explicit cancel is recorded by cancelJob.
    else if (signal.aborted)
      outcome = { status: job.status, stage: "done", errorCode: "AI_CANCELLED" };
    else outcome = await failJob(db, userId, id, owned, state, error);
  } finally {
    await releaseLease(db, id, token);
  }
  outcome ??= await currentResult(db, userId, id);
  // Durations only; never log document text or provider bodies.
  console.info("AI job step", {
    jobId: id,
    phase: (state as AiJobState | null)?.phase ?? job.status,
    status: outcome.status,
    ms: Date.now() - startedAt,
    retryAfterMs: outcome.retryAfterMs,
    errorCode: outcome.errorCode,
  });
  return outcome;
}
