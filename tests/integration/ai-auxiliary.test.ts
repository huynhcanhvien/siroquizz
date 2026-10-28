import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import { v7 } from "uuid";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/client";
import { auxiliaryTask, type CardTaskResult } from "@/server/ai/auxiliary";
import { createSetInTransaction } from "@/server/services/sets";
import { ApiError } from "@/server/api-error";
import { RateLimitError } from "@/server/ai/groq";

const provider = vi.hoisted(() => vi.fn());
const cap = vi.hoisted(() => ({ tokens: 10_000_000 }));
vi.mock("@/server/ai/groq", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/ai/groq")>()),
  groqJson: provider,
}));
vi.mock("@/server/env", () => ({
  getServerEnv: () => ({
    AI_ENABLED: "true",
    GROQ_TEXT_MODEL: "openai/gpt-oss-120b",
    AI_GLOBAL_DAILY_TOKENS: cap.tokens,
    BETTER_AUTH_SECRET: "s".repeat(40),
  }),
}));
const url =
  process.env.TEST_DATABASE_URL ??
  "postgresql://siroquizz:siroquizz_local_only@localhost:5433/siroquizz_test";
if (!new URL(url).pathname.endsWith("_test")) throw new Error("Test DB required");
const connection = postgres(url, { max: 3 }),
  db = drizzle(connection, { schema }) as Database,
  owner = v7();
const usage = { input: 100, output: 50, cached: 0, cost: 0.0001 };
const signal = () => new AbortController().signal;
/** Answers a batch request with one text per card, under the card's position id. */
const answer = (_schema: unknown, input: string) => {
  const cards = JSON.parse(input).data.cards as { id: string; term: string }[];
  return Promise.resolve({
    data: { cards: cards.map((card) => ({ id: card.id, text: `ex ${card.term}` })) },
    usage,
    model: "openai/gpt-oss-20b",
  });
};
async function setWith(count: number) {
  return db.transaction((tx) =>
    createSetInTransaction(tx, owner, {
      title: "Big",
      description: "",
      termLang: "en",
      definitionLang: "vi",
      source: "manual",
      cards: Array.from({ length: count }, (_, i) => ({
        term: `word${i}`,
        definition: `nghĩa ${i}`,
      })),
    }),
  );
}
const auxCount = async () => (await db.select().from(schema.aiAuxUsage))[0]?.count ?? 0;

beforeAll(() => migrate(db, { migrationsFolder: "drizzle" }));
beforeEach(async () => {
  await db.execute(sql`truncate "user" cascade`);
  await db
    .insert(schema.user)
    .values({ id: owner, name: "Owner", email: "aux-owner@example.com", emailVerified: true });
  provider.mockReset().mockImplementation(answer);
  cap.tokens = 10_000_000;
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => connection.end());

it("sends a large set in batches of 40 with index ids, bounded output and a deadline", async () => {
  const set = await setWith(90);
  const result = (await auxiliaryTask(
    db,
    owner,
    "examples",
    { setId: set.id },
    signal(),
  )) as CardTaskResult;
  expect(provider).toHaveBeenCalledTimes(3);
  const sizes = provider.mock.calls.map((call) => JSON.parse(call[1]).data.cards.length);
  expect(sizes).toEqual([40, 40, 10]);
  const firstCall = provider.mock.calls[0];
  expect(JSON.parse(firstCall[1]).data.cards[39].id).toBe("39");
  expect(firstCall[5].maxTokens).toBeLessThanOrEqual(4096);
  expect(firstCall[5].deadline).toBeGreaterThan(Date.now());
  expect(result.partial).toBe(false);
  expect(result.remainingIds).toEqual([]);
  expect(result.cards.map((card) => card.id)).toEqual(set.cards.map((card) => card.id));
  expect(result.cards[89].text).toBe("ex word89");
  expect(await auxCount()).toBe(1);
  // Every batch adds its provider tokens to the app-wide daily tally.
  expect((await db.select().from(schema.aiAuxUsage))[0].tokens).toBe(3 * 150);
});

it("returns the finished batches as partial when a later batch fails, without a refund", async () => {
  const set = await setWith(90);
  provider
    .mockImplementationOnce(answer)
    .mockRejectedValueOnce(new ApiError(502, "AI_PROVIDER_ERROR"));
  const result = (await auxiliaryTask(
    db,
    owner,
    "examples",
    { setId: set.id },
    signal(),
  )) as CardTaskResult;
  expect(result.partial).toBe(true);
  expect(result.cards).toHaveLength(40);
  expect(result.remainingIds).toEqual(set.cards.slice(40).map((card) => card.id));
  expect(await auxCount()).toBe(1);
  // The browser continues with the remaining cards only.
  const next = (await auxiliaryTask(
    db,
    owner,
    "examples",
    { setId: set.id, ids: result.remainingIds },
    signal(),
  )) as CardTaskResult;
  expect(next.partial).toBe(false);
  expect(next.cards.map((card) => card.id)).toEqual(result.remainingIds);
});

it("stops starting batches when the time budget runs low and does not throw", async () => {
  const set = await setWith(90);
  const start = Date.now();
  let now = start;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  provider.mockImplementationOnce(async (...args: [unknown, string]) => {
    now = start + 40_000;
    return answer(...args);
  });
  const result = (await auxiliaryTask(
    db,
    owner,
    "examples",
    { setId: set.id },
    signal(),
  )) as CardTaskResult;
  expect(provider).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({ partial: true });
  expect(result.remainingIds).toHaveLength(50);
});

it("fails and refunds when the first batch fails", async () => {
  const set = await setWith(50);
  provider.mockRejectedValueOnce(new ApiError(504, "AI_TIMEOUT"));
  await expect(
    auxiliaryTask(db, owner, "examples", { setId: set.id }, signal()),
  ).rejects.toMatchObject({ code: "AI_TIMEOUT" });
  expect(await auxCount()).toBe(0);
});

it("rejects continuation ids that match no card and unknown tasks", async () => {
  const set = await setWith(3);
  await expect(
    auxiliaryTask(db, owner, "examples", { setId: set.id, ids: ["missing"] }, signal()),
  ).rejects.toMatchObject({ status: 400 });
  await expect(auxiliaryTask(db, owner, "summary", { setId: set.id }, signal())).rejects.toThrow();
  expect(provider).not.toHaveBeenCalled();
});

it("does not charge a follow-up that presents the continuation, and passes on throttling", async () => {
  const set = await setWith(90);
  provider.mockImplementationOnce(answer).mockRejectedValueOnce(new RateLimitError(12_000));
  const first = (await auxiliaryTask(
    db,
    owner,
    "examples",
    { setId: set.id },
    signal(),
  )) as CardTaskResult;
  expect(first).toMatchObject({ partial: true, retryAfterMs: 12_000 });
  expect(first.continuation).toEqual(expect.any(String));
  expect(await auxCount()).toBe(1);
  const next = (await auxiliaryTask(
    db,
    owner,
    "examples",
    { setId: set.id, ids: first.remainingIds, continuation: first.continuation },
    signal(),
  )) as CardTaskResult;
  expect(next.partial).toBe(false);
  expect(next.continuation).toBeUndefined();
  expect(await auxCount()).toBe(1);
  // A forged or reused-for-another-task token is charged like any request.
  await auxiliaryTask(
    db,
    owner,
    "phonetics",
    { setId: set.id, ids: first.remainingIds, continuation: first.continuation },
    signal(),
  );
  await auxiliaryTask(
    db,
    owner,
    "examples",
    { setId: set.id, ids: first.remainingIds, continuation: "1.1.forged" },
    signal(),
  );
  expect(await auxCount()).toBe(3);
});

it("checks the app-wide daily token cap before calling the provider", async () => {
  const set = await setWith(10);
  // Today's spending already sits right at the shared key's cap.
  cap.tokens = 5_000;
  await db.insert(schema.aiAuxUsage).values({
    userId: owner,
    day: new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10),
    count: 0,
    tokens: 4_900,
  });
  for (const [task, input] of [
    ["examples", { setId: set.id }],
    ["phonetics", { setId: set.id }],
    ["grade", { expected: "cat", answer: "a cat", lang: "en" }],
  ] as const)
    await expect(auxiliaryTask(db, owner, task, input, signal())).rejects.toMatchObject({
      status: 429,
      code: "AI_GLOBAL_LIMIT",
    });
  expect(provider).not.toHaveBeenCalled();
  expect(await auxCount()).toBe(0);
});
