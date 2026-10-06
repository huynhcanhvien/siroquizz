import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq, sql } from "drizzle-orm";
import { v7 } from "uuid";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/client";
import {
  MAX_COPY_REWARDS_PER_DAY,
  awardCopyCredit,
  awardPublishCredit,
  chargeColumns,
  chargeJob,
  clawbackSetCredits,
  creditStatus,
  lockUser,
  reserveCredits,
} from "@/server/ai/credits";

vi.mock("@/server/env", () => ({ getServerEnv: () => ({ AI_GLOBAL_DAILY_CREDITS: 480 }) }));
const url =
  process.env.TEST_DATABASE_URL ??
  "postgresql://siroquizz:siroquizz_local_only@localhost:5433/siroquizz_test";
if (!new URL(url).pathname.endsWith("_test")) throw new Error("Test DB required");
const connection = postgres(url, { max: 3 }),
  db = drizzle(connection, { schema }) as Database,
  author = v7(),
  reader = v7();
const options = { cardCount: 5, termLang: "en", definitionLang: "vi", includePhonetic: false };

async function finishedJob(userId: string, dailyCredits: number, finishedAt = new Date()) {
  const id = v7();
  await db.insert(schema.aiJobs).values({
    id,
    userId,
    status: "done",
    prompt: "x",
    options,
    uploadIds: [],
    finishedAt,
    creditsCharged: dailyCredits,
    dailyCreditsCharged: dailyCredits,
  });
  return id;
}
async function openJob(userId: string) {
  const id = v7();
  await db
    .insert(schema.aiJobs)
    .values({ id, userId, status: "awaiting", prompt: "x", options, uploadIds: [] });
  return id;
}
/** Charges a finished job the way the job runner does, storing the charge on the job. */
async function charge(userId: string, tokens: number, refund = false) {
  const jobId = await openJob(userId);
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const result = await chargeJob(tx, userId, jobId, tokens, refund);
    await tx
      .update(schema.aiJobs)
      .set({ status: "done", finishedAt: new Date(), ...chargeColumns(result) })
      .where(eq(schema.aiJobs.id, jobId));
    return result;
  });
}
beforeAll(() => migrate(db, { migrationsFolder: "drizzle" }));
beforeEach(async () => {
  await db.execute(sql`truncate "user" cascade`);
  await db.insert(schema.user).values([
    { id: author, name: "Author", email: "credit-author@example.com", emailVerified: true },
    { id: reader, name: "Reader", email: "credit-reader@example.com", emailVerified: true },
  ]);
});
afterAll(() => connection.end());

it("gives 20 free credits a day that reset at Vietnam midnight and never accumulate", async () => {
  expect(await creditStatus(db, author)).toMatchObject({
    dailyLimit: 20,
    dailyRemaining: 20,
    earned: 0,
    available: 20,
  });
  await finishedJob(author, 15);
  expect((await creditStatus(db, author)).dailyRemaining).toBe(5);
  // Yesterday's use does not count today, and unused credits do not roll over.
  await db.execute(sql`truncate ai_generation_jobs`);
  await finishedJob(author, 20, new Date(Date.now() - 2 * 86400_000));
  expect((await creditStatus(db, author)).dailyRemaining).toBe(20);
});

it("charges tokens actually spent, today's free credits first, then earned ones", async () => {
  await finishedJob(author, 18);
  await awardPublishCredit(db, {
    authorId: author,
    setId: v7(),
    cardCount: 12,
    copiedFromId: null,
  });
  // 4,200 tokens round up to 5 credits: 2 free, 3 earned.
  await expect(charge(author, 4200)).resolves.toEqual({ credits: 5, daily: 2, refunded: false });
  expect(await creditStatus(db, author)).toMatchObject({ dailyRemaining: 0, earned: 2 });
  // Never charges more than the user has.
  await expect(charge(author, 50_000)).resolves.toMatchObject({ credits: 2, daily: 0 });
  expect((await creditStatus(db, author)).earned).toBe(0);
});

it("refunds system failures in full", async () => {
  await expect(charge(author, 9000, true)).resolves.toEqual({
    credits: 0,
    daily: 0,
    refunded: true,
  });
  expect((await creditStatus(db, author)).dailyRemaining).toBe(20);
});

it("reserves credits for accepted jobs and rejects what cannot be paid", async () => {
  const first = await openJob(author);
  await db.transaction(async (tx) => {
    await lockUser(tx, author);
    await reserveCredits(tx, author, first, 15);
  });
  expect(await creditStatus(db, author)).toMatchObject({ reserved: 0, available: 20 });
  // Reservations only count while the job runs.
  await db.update(schema.aiJobs).set({ status: "generating" }).where(eq(schema.aiJobs.id, first));
  expect(await creditStatus(db, author)).toMatchObject({ reserved: 15, available: 5 });
  const second = await openJob(author);
  const reserve = (credits: number) =>
    db.transaction(async (tx) => {
      await lockUser(tx, author);
      await reserveCredits(tx, author, second, credits);
    });
  await expect(reserve(6)).rejects.toMatchObject({ code: "AI_CREDITS_EXCEEDED" });
  await expect(reserve(41)).rejects.toMatchObject({ code: "AI_JOB_TOO_LARGE" });
  await expect(reserve(5)).resolves.toBeUndefined();
});

it("rewards publishing once per original set with enough cards", async () => {
  const setId = v7();
  const set = { authorId: author, setId, cardCount: 12, copiedFromId: null };
  await expect(awardPublishCredit(db, set)).resolves.toBe(5);
  // Making the set private and public again earns nothing more.
  await expect(awardPublishCredit(db, set)).resolves.toBe(0);
  await expect(awardPublishCredit(db, { ...set, setId: v7(), cardCount: 9 })).resolves.toBe(0);
  await expect(awardPublishCredit(db, { ...set, setId: v7(), copiedFromId: v7() })).resolves.toBe(
    0,
  );
  expect((await creditStatus(db, author)).earned).toBe(5);
});

it("rewards each person who copies a set once, up to a daily cap, never self-copies", async () => {
  const setId = v7();
  await expect(awardCopyCredit(db, { authorId: author, setId, copierId: reader })).resolves.toBe(1);
  await expect(awardCopyCredit(db, { authorId: author, setId, copierId: reader })).resolves.toBe(0);
  await expect(awardCopyCredit(db, { authorId: author, setId, copierId: author })).resolves.toBe(0);
  await db.insert(schema.creditLedger).values(
    Array.from({ length: MAX_COPY_REWARDS_PER_DAY - 1 }, () => ({
      id: v7(),
      userId: author,
      delta: 1,
      reason: "copy_reward",
      ref: `${v7()}:${v7()}`,
    })),
  );
  await expect(awardCopyCredit(db, { authorId: author, setId, copierId: v7() })).resolves.toBe(0);
  expect((await creditStatus(db, author)).earned).toBe(MAX_COPY_REWARDS_PER_DAY);
});

it("takes back a removed set's rewards once and leaves other rewards alone", async () => {
  const removed = v7(),
    kept = v7();
  await awardPublishCredit(db, {
    authorId: author,
    setId: removed,
    cardCount: 12,
    copiedFromId: null,
  });
  await awardPublishCredit(db, {
    authorId: author,
    setId: kept,
    cardCount: 12,
    copiedFromId: null,
  });
  await awardCopyCredit(db, { authorId: author, setId: removed, copierId: reader });
  await expect(clawbackSetCredits(db, author, removed)).resolves.toBe(6);
  await expect(clawbackSetCredits(db, author, removed)).resolves.toBe(0);
  expect((await creditStatus(db, author)).earned).toBe(5);
});
