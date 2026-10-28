import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";
import { creditsForCards } from "@/features/ai-generate/lib/credits";
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
  confirmJob,
  getQuota,
  listJobs,
  requireJob,
  quotaWindow,
  type StepResult,
} from "@/server/ai/jobs";
import { auxiliaryTask } from "@/server/ai/auxiliary";
import { createSetInTransaction, getSet, updateSet } from "@/server/services/sets";
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
    // The user accepts the estimate as offered.
    if (last.status === "awaiting") await confirmJob(db, userId, jobId, {});
  }
  throw new Error("stepJob did not terminate");
}
import { ApiError } from "@/server/api-error";
const provider = vi.hoisted(() => vi.fn());
const queue = vi.hoisted(() => ({ slots: 20, globalTokens: 350_000 }));
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
    ocrPages: 0,
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
    AI_GLOBAL_DAILY_TOKENS: queue.globalTokens,
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
  await db.execute(sql`truncate "user", ai_result_cache cascade`);
  await db.insert(schema.user).values([
    { id: a, name: "A", email: "ai-a@example.com", emailVerified: true },
    { id: b, name: "B", email: "ai-b@example.com", emailVerified: true },
  ]);
  provider.mockReset().mockResolvedValue(output);
  queue.slots = 20;
  queue.globalTokens = 350_000;
});
/** The job's full row, for checks beyond what requireJob returns. */
const jobRow = async (id: string) =>
  (await db.select().from(schema.aiJobs).where(eq(schema.aiJobs.id, id)))[0];
/** Today's free credits left for a user. */
const daily = async (userId: string) => (await getQuota(db, userId)).dailyRemaining;
/** A job that already used `credits` of today's free credits. */
async function spentToday(userId: string, credits: number) {
  await db.insert(schema.aiJobs).values({
    id: v7(),
    userId,
    status: "done",
    prompt: "earlier",
    options: input.options,
    uploadIds: [],
    finishedAt: new Date(),
    creditsCharged: credits,
    dailyCreditsCharged: credits,
  });
}
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
  // 200 provider tokens round up to one credit.
  expect(final.creditsCharged).toBe(1);
  expect(await daily(a)).toBe(19);
  expect((await listJobs(db, a))[0].creditsCharged).toBe(1);
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
it("limits each person to two unfinished generations", async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 3 }, () => createJob(db, a, input)),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
  expect(
    (results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason,
  ).toMatchObject({ code: "AI_BUSY" });
  const open = results.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<{
    jobId: string;
  }>;
  await cancelJob(db, a, open.value.jobId);
  await expect(createJob(db, a, input)).resolves.toHaveProperty("jobId");
  // Another person is not affected.
  await expect(createJob(db, b, input)).resolves.toHaveProperty("jobId");
});
it("recovers from a single provider failure", async () => {
  provider.mockRejectedValueOnce(new ApiError(502, "AI_PROVIDER_ERROR"));
  const job = await createJob(db, a, input);
  expect((await runToEnd(db, a, job.jobId)).status).toBe("done");
});
it("refunds failures caused by the system and says so", async () => {
  provider
    .mockRejectedValueOnce(new ApiError(502, "AI_PROVIDER_ERROR"))
    .mockRejectedValueOnce(new ApiError(502, "AI_PROVIDER_ERROR"))
    .mockRejectedValueOnce(new ApiError(502, "AI_PROVIDER_ERROR"));
  let job = await createJob(db, a, input);
  await expect(runToEnd(db, a, job.jobId)).resolves.toMatchObject({
    status: "error",
    errorCode: "AI_PROVIDER_ERROR",
    creditsCharged: 0,
    refunded: true,
  });
  // Tokens were spent on a response that turned out unusable: still the system's fault.
  provider.mockResolvedValueOnce({ ...output, data: { cards: [] } });
  job = await createJob(db, a, input);
  await expect(runToEnd(db, a, job.jobId)).resolves.toMatchObject({
    status: "error",
    refunded: true,
  });
  expect(await daily(a)).toBe(20);
  expect((await getQuota(db, a)).reserved).toBe(0);
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
  expect(await daily(a)).toBe(20);
  expect((await getQuota(db, a)).reserved).toBeGreaterThan(0);
  // The browser reconnects and the job resumes from its saved state.
  expect((await runToEnd(db, a, job.jobId)).status).toBe("done");
});
it("an explicit cancel is final and charges only what was already spent", async () => {
  const job = await createJob(db, a, input);
  await stepJob(db, a, job.jobId, new AbortController().signal);
  await cancelJob(db, a, job.jobId);
  await expect(runToEnd(db, a, job.jobId)).resolves.toMatchObject({
    status: "cancelled",
    creditsCharged: 0,
    refunded: false,
  });
  expect(await daily(a)).toBe(20);
  expect((await getQuota(db, a)).reserved).toBe(0);
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
  await expect(runToEnd(db, a, job.jobId)).resolves.toMatchObject({
    status: "done",
    creditsCharged: 0,
  });
  expect(await daily(a)).toBe(20);
  expect(provider).not.toHaveBeenCalled();
  expect((await requireJob(db, a, job.jobId)).status).toBe("done");
});
const auxUsage = { input: 10, output: 5, cached: 0, cost: 0 };
it("enforces auxiliary limits and refunds failures", async () => {
  provider.mockResolvedValue({ usage: auxUsage, data: { correct: true, reason: "Same meaning" } });
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
  provider.mockResolvedValue({
    usage: auxUsage,
    data: { cards: [{ id: "0", text: "<b>kæt</b>" }] },
  });
  expect(
    await auxiliaryTask(
      db,
      a,
      "phonetics",
      { cards: [{ id: "a", term: "cat", definition: "mèo" }] },
      new AbortController().signal,
    ),
  ).toEqual({ cards: [{ id: "a", text: "kæt" }], partial: false, remainingIds: [] });
  provider.mockResolvedValue({ usage: auxUsage, data: { cards: [{ id: "foreign", text: "x" }] } });
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
it("checks Chinese auxiliary tones against the dictionary and preserves returned card IDs", async () => {
  provider.mockResolvedValue({
    usage: auxUsage,
    data: {
      cards: [
        { id: "1", text: "xié xié" },
        { id: "0", text: "xuè xǐ" },
      ],
    },
  });
  const result = await auxiliaryTask(
    db,
    a,
    "phonetics",
    {
      lang: "zh",
      cards: [
        { id: "first", term: "学习", definition: "học tập" },
        { id: "second", term: "谢谢", definition: "cảm ơn" },
      ],
    },
    new AbortController().signal,
  );
  expect(result).toEqual({
    cards: [
      { id: "second", text: "xiè xie" },
      { id: "first", text: "xué xí" },
    ],
    partial: false,
    remainingIds: [],
  });
  const request = JSON.parse(provider.mock.calls[0][1]);
  expect(request.data.language).toBe("zh");
  expect(request.data.cards[0].pronunciationReference.citation).toBe("xué xí");
  expect(provider.mock.calls[0][4]).toBe("openai/gpt-oss-120b");
});
it("rejects blank auxiliary transcriptions and refunds their usage", async () => {
  provider.mockResolvedValue({ usage: auxUsage, data: { cards: [{ id: "0", text: "<b></b>" }] } });
  await expect(
    auxiliaryTask(
      db,
      a,
      "phonetics",
      {
        lang: "en",
        cards: [{ id: "a", term: "cat", definition: "mèo" }],
      },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
  expect((await db.select().from(schema.aiAuxUsage))[0].count).toBe(0);
});
it("fills newly added Chinese cards after a previous fill without overwriting saved phonetics", async () => {
  let set = await db.transaction((tx) =>
    createSetInTransaction(tx, a, {
      title: "Chinese additions",
      description: "",
      termLang: "zh",
      definitionLang: "vi",
      source: "manual",
      cards: [
        { term: "学习", definition: "học tập" },
        { term: "谢谢", definition: "cảm ơn" },
      ],
    }),
  );
  provider.mockResolvedValueOnce({
    usage: auxUsage,
    data: { cards: set.cards.map((_, i) => ({ id: String(i), text: ["xué xí", "xiè xie"][i] })) },
  });
  const first = await auxiliaryTask(
    db,
    a,
    "phonetics",
    { setId: set.id },
    new AbortController().signal,
  );
  const initial = (first as { cards: { id: string; text: string }[] }).cards;
  set = await updateSet(db, a, set.id, {
    ...set,
    cards: set.cards.map((card) => ({
      ...card,
      phonetic: initial.find((c) => c.id === card.id)!.text,
    })),
  });
  const saved = set.cards;
  set = await updateSet(db, a, set.id, {
    ...set,
    cards: [...saved, { term: "朋友", definition: "bạn bè", phonetic: " " }],
  });
  const added = set.cards[2];
  // The user can also compare new AI readings for every card, including saved ones.
  provider.mockResolvedValueOnce({
    usage: auxUsage,
    data: {
      cards: set.cards.map((_, i) => ({
        id: String(i),
        text: ["xué xí", "xiè xie", "péng you"][i],
      })),
    },
  });
  await auxiliaryTask(
    db,
    a,
    "phonetics",
    { setId: set.id, scope: "all" },
    new AbortController().signal,
  );
  expect(JSON.parse(provider.mock.calls[1][1]).data.cards).toHaveLength(3);
  expect((await getSet(db, a, set.id)).cards).toEqual(set.cards);
  provider.mockResolvedValueOnce({
    usage: auxUsage,
    data: { cards: [{ id: "0", text: "péng you" }] },
  });
  const next = await auxiliaryTask(
    db,
    a,
    "phonetics",
    { setId: set.id },
    new AbortController().signal,
  );
  expect(next).toEqual({
    cards: [{ id: added.id, text: "péng you" }],
    partial: false,
    remainingIds: [],
  });
  expect(JSON.parse(provider.mock.calls[2][1]).data.cards).toEqual([
    expect.objectContaining({ id: "0", term: "朋友" }),
  ]);
  set = await updateSet(db, a, set.id, {
    ...set,
    cards: set.cards.map((card) => ({
      ...card,
      phonetic: card.id === added.id ? "péng you" : card.phonetic,
    })),
  });
  expect((await getSet(db, a, set.id)).cards).toEqual([
    ...saved,
    { ...added, phonetic: "péng you" },
  ]);
  // Explicitly regenerating a complete set remains supported.
  provider.mockResolvedValueOnce({
    usage: auxUsage,
    data: { cards: set.cards.map((card, i) => ({ id: String(i), text: card.phonetic })) },
  });
  await auxiliaryTask(db, a, "phonetics", { setId: set.id }, new AbortController().signal);
  expect(JSON.parse(provider.mock.calls[3][1]).data.cards).toHaveLength(3);
});
it("corrects Chinese transcriptions before generated cards are finalized", async () => {
  provider.mockResolvedValue({
    ...output,
    data: {
      cards: [
        { term: "学习", definition: "học tập", phonetic: "xuè xǐ" },
        { term: "谢谢", definition: "cảm ơn", phonetic: "xié xié" },
      ],
    },
  });
  const job = await createJob(db, a, {
    ...input,
    options: {
      ...input.options,
      termLang: "zh",
      includePhonetic: true,
    },
  });
  const result = await runToEnd(db, a, job.jobId);
  expect(result.status).toBe("done");
  expect((await jobRow(job.jobId)).result).toMatchObject({
    cards: [
      { term: "学习", phonetic: "xué xí" },
      { term: "谢谢", phonetic: "xiè xie" },
    ],
  });
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
    refunded: true,
  });
  expect(await daily(a)).toBe(20);
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
  const saved = await jobRow(job.jobId);
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
it("asks before an expensive generation and reserves what the user accepts", async () => {
  const job = await createJob(db, a, { ...input, options: { ...input.options, cardCount: 80 } });
  const step = await stepJob(db, a, job.jobId, new AbortController().signal);
  expect(step).toMatchObject({
    status: "awaiting",
    estimate: { cardCount: 80, usedCredits: 0, quota: { dailyRemaining: 20 } },
  });
  expect(step.estimate!.credits).toBeGreaterThan(5);
  expect(provider).not.toHaveBeenCalled();
  // Stepping again while waiting changes nothing.
  await expect(stepJob(db, a, job.jobId, new AbortController().signal)).resolves.toMatchObject({
    status: "awaiting",
  });
  await confirmJob(db, a, job.jobId, { cardCount: 40 });
  const saved = await jobRow(job.jobId);
  expect(saved.status).toBe("queued");
  expect(saved.creditsReserved).toBeLessThan(step.estimate!.credits);
  expect((saved.options as { cardCount: number }).cardCount).toBe(40);
  await expect(confirmJob(db, a, job.jobId, {})).rejects.toMatchObject({ code: "CONFLICT" });
  const final = await runToEnd(db, a, job.jobId);
  expect(final.status).toBe("done");
  expect((await getQuota(db, a)).reserved).toBe(0);
});
it("refuses a confirmation the user cannot afford, then spends earned credits", async () => {
  await spentToday(a, 18);
  // 40 cards cost 10 credits; only 2 free credits are left today.
  const job = await createJob(db, a, { ...input, options: { ...input.options, cardCount: 40 } });
  const step = await stepJob(db, a, job.jobId, new AbortController().signal);
  expect(step.status).toBe("awaiting");
  await expect(confirmJob(db, a, job.jobId, {})).rejects.toMatchObject({
    code: "AI_CREDITS_EXCEEDED",
  });
  await db
    .insert(schema.creditLedger)
    .values({ id: v7(), userId: a, delta: 10, reason: "publish_reward", ref: v7() });
  await confirmJob(db, a, job.jobId, {});
  // Every request yields new cards; they cost more than the 2 free credits left today, so the
  // rest comes from earned credits.
  let made = 0;
  provider.mockImplementation(async () => ({
    ...output,
    data: {
      cards: Array.from({ length: 10 }, () => ({
        term: `word ${++made}`,
        definition: "nghĩa",
        phonetic: "",
      })),
    },
  }));
  const final = await runToEnd(db, a, job.jobId);
  expect(final.status).toBe("done");
  expect(final.creditsCharged).toBe(creditsForCards(final.result!.cards.length));
  expect(final.creditsCharged).toBeGreaterThan(2);
  const quota = await getQuota(db, a);
  expect(quota.dailyRemaining).toBe(0);
  expect(quota.earned).toBe(10 - (final.creditsCharged! - 2));
});
it("stops new jobs when the app's shared daily allowance is used up", async () => {
  // 1,100 tokens already spent today against a budget of 1,000.
  queue.globalTokens = 1000;
  await db.insert(schema.aiJobs).values({
    id: v7(),
    userId: b,
    status: "done",
    prompt: "x",
    options: input.options,
    uploadIds: [],
    finishedAt: new Date(),
    inputTokens: 900,
    outputTokens: 200,
  });
  await expect(createJob(db, a, input)).rejects.toMatchObject({ code: "AI_GLOBAL_LIMIT" });
});
it("reuses the result of an identical document request for free", async () => {
  const upload = async () => {
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
    return id;
  };
  const request = { ...input, prompt: "Make cards", uploadIds: [await upload()] };
  const first = await runToEnd(db, a, (await createJob(db, a, request)).jobId);
  expect(first.creditsCharged).toBe(1);
  const calls = provider.mock.calls.length;
  const again = { ...request, uploadIds: [await upload()] };
  const second = await runToEnd(db, a, (await createJob(db, a, again)).jobId);
  expect(second).toMatchObject({ status: "done", creditsCharged: 0 });
  expect(second.result?.cards.map((c) => c.term)).toEqual(first.result?.cards.map((c) => c.term));
  expect(provider).toHaveBeenCalledTimes(calls);
  // A different request is not served from the cache.
  const other = { ...again, prompt: "Other", uploadIds: [await upload()] };
  await runToEnd(db, a, (await createJob(db, a, other)).jobId);
  expect(provider.mock.calls.length).toBeGreaterThan(calls);
});
