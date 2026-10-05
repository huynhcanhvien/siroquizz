import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq, sql } from "drizzle-orm";
import { v7 } from "uuid";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/client";
import {
  createJob,
  stepJob,
  cancelJob,
  getQuota,
  listJobs,
  requireJob,
  quotaWindow,
  type StepResult,
} from "@/server/ai/jobs";
import { auxiliaryTask } from "@/server/ai/auxiliary";
import { RateLimitError } from "@/server/ai/groq";

const terminal = new Set(["done", "error", "cancelled"]);
/** Drives a job the way the client does: repeated short steps until it reaches a terminal state. */
async function runToEnd(
  db: Database,
  userId: string,
  jobId: string,
  signal: AbortSignal = new AbortController().signal,
): Promise<StepResult> {
  let last: StepResult | undefined;
  for (let i = 0; i < 50; i++) {
    last = await stepJob(db, userId, jobId, signal);
    if (terminal.has(last.status)) return last;
  }
  throw new Error("stepJob did not terminate");
}
import { ApiError } from "@/server/api-error";
const provider = vi.hoisted(() => vi.fn());
const queue = vi.hoisted(() => ({ slots: 20 }));
vi.mock("@/server/ai/groq", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/ai/groq")>()),
  groqJson: provider,
}));
vi.mock("@/server/ai/extract", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/ai/extract")>()),
  countPdfPages: vi.fn(async () => 1),
  validateMagic: vi.fn(() => "txt"),
  extractDocument: vi.fn(async () => ({
    text: "cat - mèo\ndog - chó",
    pages: 1,
    usage: { input: 0, output: 0, cached: 0, cost: 0 },
  })),
}));
vi.mock("@/server/ai/storage", () => ({ getUpload: vi.fn(async () => Buffer.from("test")) }));
vi.mock("@/server/env", () => ({
  getServerEnv: () => ({
    AI_ENABLED: "true",
    GROQ_TEXT_MODEL: "openai/gpt-oss-120b",
    GROQ_FALLBACK_MODEL: "openai/gpt-oss-20b",
    AI_MAX_ACTIVE_JOBS: queue.slots,
  }),
}));
const url =
  process.env.TEST_DATABASE_URL ??
  "postgresql://siroquizz:siroquizz_local_only@localhost:5433/siroquizz_test";
if (!new URL(url).pathname.endsWith("_test")) throw new Error("Test DB required");
const connection = postgres(url, { max: 3 }),
  db = drizzle(connection, { schema }) as Database,
  a = v7(),
  b = v7();
const input = {
  uploadIds: [],
  prompt: "Five animals",
  options: { cardCount: 5, termLang: "en", definitionLang: "vi", includePhonetic: false },
};
const output = {
  data: {
    cards: [
      { term: "cat", definition: "mèo", phonetic: "" },
      { term: "dog", definition: "chó", phonetic: "" },
    ],
  },
  usage: { input: 100, output: 100, cached: 0, cost: 0.0001 },
};
beforeAll(() => migrate(db, { migrationsFolder: "drizzle" }));
beforeEach(async () => {
  await db.execute(sql`truncate "user" cascade`);
  await db.insert(schema.user).values([
    { id: a, name: "A", email: "ai-a@example.com", emailVerified: true },
    { id: b, name: "B", email: "ai-b@example.com", emailVerified: true },
  ]);
  provider.mockReset().mockResolvedValue(output);
  queue.slots = 20;
});
afterAll(() => connection.end());
it("Vietnam quota resets at midnight with the correct UTC boundary", () => {
  expect(quotaWindow(new Date("2026-10-04T16:59:59Z")).reset.toISOString()).toBe(
    "2026-10-04T17:00:00.000Z",
  );
  expect(quotaWindow(new Date("2026-10-04T17:00:00Z")).day).toBe("2026-10-05");
});
it("persists a real job lifecycle and charges only successful completion", async () => {
  const { jobId } = await createJob(db, a, input);
  const final = await runToEnd(db, a, jobId);
  expect(final.status).toBe("done");
  expect(final.result?.cards).toHaveLength(2);
  expect((await requireJob(db, a, jobId)).status).toBe("done");
  expect((await getQuota(db, a)).remaining).toBe(4);
  expect((await listJobs(db, a))[0].result?.cards).toHaveLength(2);
  const calls = provider.mock.calls.length;
  // Re-stepping a finished job returns the stored result without re-running the provider.
  const replay = await stepJob(db, a, jobId, new AbortController().signal);
  expect(replay.status).toBe("done");
  expect(provider).toHaveBeenCalledTimes(calls);
  await expect(requireJob(db, b, jobId)).rejects.toMatchObject({ status: 404 });
  await expect(cancelJob(db, b, jobId)).rejects.toMatchObject({ status: 404 });
  expect(await listJobs(db, b)).toEqual([]);
});
it("serializes concurrent quota reservations and releases cancelled jobs", async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 6 }, () => createJob(db, a, input)),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
  expect(
    (results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason,
  ).toMatchObject({ status: 429 });
  const done = results.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<{
    jobId: string;
  }>;
  await cancelJob(db, a, done.value.jobId);
  expect((await getQuota(db, a)).remaining).toBe(5);
  await expect(createJob(db, a, input)).resolves.toHaveProperty("jobId");
});
it("recovers from a single provider failure", async () => {
  provider.mockRejectedValueOnce(new ApiError(502, "AI_PROVIDER_ERROR"));
  const job = await createJob(db, a, input);
  expect((await runToEnd(db, a, job.jobId)).status).toBe("done");
});
it("provider failure and malformed output do not consume quota", async () => {
  provider
    .mockRejectedValueOnce(new ApiError(502, "AI_PROVIDER_ERROR"))
    .mockRejectedValueOnce(new ApiError(502, "AI_PROVIDER_ERROR"))
    .mockRejectedValueOnce(new ApiError(502, "AI_PROVIDER_ERROR"));
  let job = await createJob(db, a, input);
  await runToEnd(db, a, job.jobId);
  expect((await requireJob(db, a, job.jobId)).errorCode).toBe("AI_PROVIDER_ERROR");
  provider.mockResolvedValueOnce({ ...output, data: { cards: [] } });
  job = await createJob(db, a, input);
  await runToEnd(db, a, job.jobId);
  expect((await requireJob(db, a, job.jobId)).status).toBe("error");
  expect((await getQuota(db, a)).remaining).toBe(5);
});
it("stops provider work on disconnect without completing, charging or killing the job", async () => {
  const abort = new AbortController();
  provider.mockImplementationOnce(
    async (_schema, _input, signal: AbortSignal) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
      ),
  );
  const job = await createJob(db, a, input);
  // The first step only plans the work; the provider is called from the second.
  await stepJob(db, a, job.jobId, new AbortController().signal);
  const running = stepJob(db, a, job.jobId, abort.signal);
  await vi.waitFor(() => expect(provider).toHaveBeenCalled());
  abort.abort();
  await running;
  expect((await requireJob(db, a, job.jobId)).status).toBe("generating");
  expect((await getQuota(db, a)).remaining).toBe(5);
  // The browser reconnects and the job resumes from its saved state.
  expect((await runToEnd(db, a, job.jobId)).status).toBe("done");
});
it("an explicit cancel is final and never charges", async () => {
  const job = await createJob(db, a, input);
  await stepJob(db, a, job.jobId, new AbortController().signal);
  await cancelJob(db, a, job.jobId);
  await expect(runToEnd(db, a, job.jobId)).resolves.toMatchObject({ status: "cancelled" });
  expect((await getQuota(db, a)).remaining).toBe(5);
});
it("imports clear pairs without a provider call and validates upload ownership", async () => {
  const id = v7();
  await db.insert(schema.aiUploads).values({
    id,
    userId: a,
    key: `uploads/${id}`,
    name: "animals.txt",
    mime: "text/plain",
    size: 4,
    expiresAt: new Date(Date.now() + 60000),
  });
  await expect(createJob(db, b, { ...input, uploadIds: [id] })).rejects.toMatchObject({
    status: 404,
  });
  await expect(createJob(db, a, { ...input, uploadIds: [id, id] })).rejects.toMatchObject({
    status: 400,
  });
  const job = await createJob(db, a, { ...input, prompt: "", uploadIds: [id] });
  await runToEnd(db, a, job.jobId);
  expect(provider).not.toHaveBeenCalled();
  expect((await requireJob(db, a, job.jobId)).status).toBe("done");
});
it("enforces auxiliary limits and refunds failures", async () => {
  provider.mockResolvedValue({ data: { correct: true, reason: "Same meaning" } });
  const args = { expected: "cat", answer: "a cat", lang: "en" };
  expect(await auxiliaryTask(db, a, "grade", args, new AbortController().signal)).toMatchObject({
    correct: true,
  });
  await db.update(schema.aiAuxUsage).set({ count: 50 }).where(eq(schema.aiAuxUsage.userId, a));
  await expect(
    auxiliaryTask(db, a, "grade", args, new AbortController().signal),
  ).rejects.toMatchObject({ status: 429 });
  await db.update(schema.aiAuxUsage).set({ count: 1 }).where(eq(schema.aiAuxUsage.userId, a));
  provider.mockRejectedValueOnce(new Error("offline"));
  await expect(auxiliaryTask(db, a, "grade", args, new AbortController().signal)).rejects.toThrow();
  expect((await db.select().from(schema.aiAuxUsage))[0].count).toBe(1);
});
it("validates auxiliary card IDs and cleans plain-text output", async () => {
  provider.mockResolvedValue({ data: { cards: [{ id: "a", text: "<b>kæt</b>" }] } });
  expect(
    await auxiliaryTask(
      db,
      a,
      "phonetics",
      { cards: [{ id: "a", term: "cat", definition: "mèo" }] },
      new AbortController().signal,
    ),
  ).toEqual({ cards: [{ id: "a", text: "kæt" }] });
  provider.mockResolvedValue({ data: { cards: [{ id: "foreign", text: "x" }] } });
  await expect(
    auxiliaryTask(
      db,
      a,
      "examples",
      { cards: [{ id: "a", term: "cat", definition: "mèo" }] },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ status: 502 });
});
it("queues jobs beyond the shared provider slots in creation order", async () => {
  queue.slots = 1;
  const first = await createJob(db, a, input);
  const second = await createJob(db, b, input);
  await stepJob(db, a, first.jobId, new AbortController().signal);
  await expect(stepJob(db, b, second.jobId, new AbortController().signal)).resolves.toMatchObject({
    status: "queued",
    stage: "queued",
    queuePosition: 1,
    retryAfterMs: expect.any(Number),
  });
  expect((await requireJob(db, b, second.jobId)).status).toBe("queued");
  expect((await runToEnd(db, a, first.jobId)).status).toBe("done");
  expect((await runToEnd(db, b, second.jobId)).status).toBe("done");
});
it("does not let an abandoned job hold the queue", async () => {
  queue.slots = 1;
  const abandoned = await createJob(db, a, input);
  const old = new Date(Date.now() - 300_000);
  await db
    .update(schema.aiJobs)
    .set({ createdAt: old, heartbeatAt: old })
    .where(eq(schema.aiJobs.id, abandoned.jobId));
  const waiting = await createJob(db, b, input);
  expect((await runToEnd(db, b, waiting.jobId)).status).toBe("done");
});
it("keeps a job that is still waiting in the queue alive past ten minutes", async () => {
  const job = await createJob(db, a, input);
  await db
    .update(schema.aiJobs)
    .set({ createdAt: new Date(Date.now() - 900_000), heartbeatAt: new Date() })
    .where(eq(schema.aiJobs.id, job.jobId));
  await createJob(db, a, input);
  expect((await requireJob(db, a, job.jobId)).status).toBe("queued");
});
it("fails with RATE_LIMITED after ten minutes of throttling without progress", async () => {
  provider.mockRejectedValue(new RateLimitError(60_000));
  const job = await createJob(db, a, input);
  await expect(runToEnd(db, a, job.jobId)).resolves.toMatchObject({
    status: "error",
    errorCode: "RATE_LIMITED",
  });
  expect((await getQuota(db, a)).remaining).toBe(5);
});
it("lets only one step run a job at a time", async () => {
  const job = await createJob(db, a, input);
  await stepJob(db, a, job.jobId, new AbortController().signal);
  let release!: () => void;
  provider.mockImplementationOnce(
    () => new Promise((resolve) => (release = () => resolve(output))),
  );
  const first = stepJob(db, a, job.jobId, new AbortController().signal);
  await vi.waitFor(() => expect(provider).toHaveBeenCalledTimes(1));
  await expect(stepJob(db, a, job.jobId, new AbortController().signal)).resolves.toMatchObject({
    status: "generating",
    retryAfterMs: expect.any(Number),
  });
  expect(provider).toHaveBeenCalledTimes(1);
  release();
  await first;
  expect((await runToEnd(db, a, job.jobId)).status).toBe("done");
  expect(provider).toHaveBeenCalledTimes(1);
});
it("recovers the lease of a step that died and ignores its late writes", async () => {
  const job = await createJob(db, a, input);
  await stepJob(db, a, job.jobId, new AbortController().signal);
  let release!: () => void;
  provider.mockImplementationOnce(
    () => new Promise((resolve) => (release = () => resolve(output))),
  );
  const stale = stepJob(db, a, job.jobId, new AbortController().signal);
  await vi.waitFor(() => expect(provider).toHaveBeenCalledTimes(1));
  // The platform killed that invocation; its lease runs out.
  await db
    .update(schema.aiJobs)
    .set({ stepLeaseUntil: new Date(Date.now() - 1000) })
    .where(eq(schema.aiJobs.id, job.jobId));
  const final = await runToEnd(db, a, job.jobId);
  expect(final.status).toBe("done");
  release();
  await expect(stale).resolves.toMatchObject({ status: "done" });
  const saved = await requireJob(db, a, job.jobId);
  expect(saved.status).toBe("done");
  expect(saved.stepLease).toBeNull();
  expect(final.result?.cards).toHaveLength(2);
});
it("returns the cards it could make and reports the parts it had to skip", async () => {
  provider
    .mockRejectedValueOnce(new ApiError(502, "AI_INVALID_OUTPUT"))
    .mockRejectedValueOnce(new ApiError(502, "AI_INVALID_OUTPUT"))
    .mockRejectedValueOnce(new ApiError(502, "AI_INVALID_OUTPUT"));
  // 80 cards need two requests, so one can fail while the other succeeds.
  const job = await createJob(db, a, { ...input, options: { ...input.options, cardCount: 80 } });
  const final = await runToEnd(db, a, job.jobId);
  expect(final.status).toBe("done");
  expect(final.result).toMatchObject({ skippedParts: 1, totalParts: 2 });
  expect(final.result?.cards).toHaveLength(2);
});
