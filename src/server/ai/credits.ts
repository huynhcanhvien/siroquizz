import "server-only";
import { and, eq, gte, inArray, like, lt, or, sql } from "drizzle-orm";
import { v7 } from "uuid";
import { DAILY_FREE_CREDITS, MAX_JOB_CREDITS } from "@/features/ai-generate/lib/credits";
import { ApiError } from "../api-error";
import type { Database } from "../db/client";
import { aiAuxUsage, aiJobs, creditLedger, user } from "../db/schema";
import { getServerEnv } from "../env";
import type { Transaction } from "../services/sets";

type Executor = Database | Transaction;
export const ACTIVE_JOB_STATUSES = ["queued", "extracting", "generating", "validating"];
export const PUBLISH_REWARD = 5;
export const COPY_REWARD = 1;
export const MAX_COPY_REWARDS_PER_DAY = 30;
export const MIN_PUBLIC_CARDS = 10;
export const MAX_PUBLISH_REWARDS_PER_DAY = 3;
/** Accounts younger than this earn no publish rewards (throwaway-account farming). */
export const MIN_ACCOUNT_AGE_MS = 24 * 3600_000;

/** The Vietnam calendar day: free credits reset at local midnight. */
export function quotaWindow(now = new Date()) {
  const shifted = new Date(now.getTime() + 7 * 3600_000);
  const day = shifted.toISOString().slice(0, 10);
  const start = new Date(`${day}T00:00:00+07:00`);
  return { start, reset: new Date(start.getTime() + 86400_000), day };
}
const finishedToday = () => {
  const { start, reset } = quotaWindow();
  return and(gte(aiJobs.finishedAt, start), lt(aiJobs.finishedAt, reset));
};

export interface CreditStatus {
  dailyLimit: number;
  dailyUsed: number;
  dailyRemaining: number;
  /** Earned credits; they never expire. */
  earned: number;
  /** Held by this user's jobs that are still running. */
  reserved: number;
  /** What a new request may spend right now. */
  available: number;
  resetsAt: string;
}
export async function creditStatus(db: Executor, userId: string): Promise<CreditStatus> {
  const [[jobs], [ledger]] = await Promise.all([
    db
      .select({
        daily: sql<number>`coalesce(sum(${aiJobs.dailyCreditsCharged}) filter (where ${finishedToday()}), 0)::int`,
        reserved: sql<number>`coalesce(sum(${aiJobs.creditsReserved}) filter (where ${inArray(aiJobs.status, ACTIVE_JOB_STATUSES)}), 0)::int`,
      })
      .from(aiJobs)
      .where(eq(aiJobs.userId, userId)),
    db
      .select({ balance: sql<number>`coalesce(sum(${creditLedger.delta}), 0)::int` })
      .from(creditLedger)
      .where(eq(creditLedger.userId, userId)),
  ]);
  const dailyRemaining = Math.max(0, DAILY_FREE_CREDITS - jobs.daily);
  const earned = Math.max(0, ledger.balance);
  return {
    dailyLimit: DAILY_FREE_CREDITS,
    dailyUsed: Math.min(DAILY_FREE_CREDITS, jobs.daily),
    dailyRemaining,
    earned,
    reserved: jobs.reserved,
    available: Math.max(0, dailyRemaining + earned - jobs.reserved),
    resetsAt: quotaWindow().reset.toISOString(),
  };
}

/**
 * Tokens a reserved credit stands for, for jobs reserved before tokens_reserved was recorded
 * (4 cards ≈ 2,500 tokens).
 */
const LEGACY_TOKENS_PER_RESERVED_CREDIT = 3000;

/**
 * Provider tokens the whole app has used or committed today on the one shared key: tokens spent
 * by jobs finished today, the estimates running jobs reserved, and auxiliary/moderation calls.
 */
export async function globalTokensToday(db: Executor) {
  const { start, day } = quotaWindow();
  const [[jobs], [aux]] = await Promise.all([
    db
      .select({
        spent: sql<number>`coalesce(sum(${aiJobs.inputTokens} + ${aiJobs.outputTokens}) filter (where ${aiJobs.finishedAt} >= ${start.toISOString()}::timestamptz), 0)::int`,
        reserved: sql<number>`coalesce(sum(coalesce(nullif(${aiJobs.tokensReserved}, 0), ${aiJobs.creditsReserved} * ${LEGACY_TOKENS_PER_RESERVED_CREDIT})) filter (where ${inArray(aiJobs.status, ACTIVE_JOB_STATUSES)}), 0)::int`,
      })
      .from(aiJobs),
    db
      .select({ tokens: sql<number>`coalesce(sum(${aiAuxUsage.tokens}), 0)::int` })
      .from(aiAuxUsage)
      .where(eq(aiAuxUsage.day, day)),
  ]);
  return jobs.spent + jobs.reserved + aux.tokens;
}
/**
 * recordAuxTokens for callers that already have a result: a failed tally write is logged, never
 * allowed to discard work the provider already did.
 */
export async function tallyAuxTokens(db: Executor, userId: string, tokens: number) {
  try {
    await recordAuxTokens(db, userId, tokens);
  } catch (error) {
    console.error("Could not record AI tokens", { userId, tokens, error });
  }
}
/** Adds provider tokens an auxiliary task or a moderation check spent to today's tally. */
export async function recordAuxTokens(db: Executor, userId: string, tokens: number) {
  // Provider usage is external data: ignore anything that is not a positive count.
  if (!Number.isFinite(tokens) || tokens <= 0) return;
  const spent = Math.round(tokens);
  const { day } = quotaWindow();
  await db
    .insert(aiAuxUsage)
    .values({ userId, day, count: 0, tokens: spent })
    .onConflictDoUpdate({
      target: [aiAuxUsage.userId, aiAuxUsage.day],
      set: { tokens: sql`${aiAuxUsage.tokens} + ${spent}` },
    });
}
/** Refuses work that would take the shared key past today's app-wide token budget. */
export async function assertGlobalCapacity(db: Executor, tokens: number) {
  if ((await globalTokensToday(db)) + tokens > getServerEnv().AI_GLOBAL_DAILY_TOKENS)
    throw new ApiError(429, "AI_GLOBAL_LIMIT");
}

/** Locks the user's row so concurrent reservations and charges see each other. */
export const lockUser = (tx: Transaction, userId: string) =>
  tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");

/**
 * Holds `credits` for a job the user agreed to run, which will use about `tokens` provider tokens.
 * Call inside a transaction holding lockUser. Fails with a specific reason so the user knows what
 * to change.
 */
export async function reserveCredits(
  tx: Transaction,
  userId: string,
  jobId: string,
  credits: number,
  tokens: number,
) {
  if (credits > MAX_JOB_CREDITS) throw new ApiError(400, "AI_JOB_TOO_LARGE");
  const status = await creditStatus(tx, userId);
  if (credits > status.available) throw new ApiError(402, "AI_CREDITS_EXCEEDED");
  await assertGlobalCapacity(tx, tokens);
  await tx
    .update(aiJobs)
    .set({ creditsEstimated: credits, creditsReserved: credits, tokensReserved: tokens })
    .where(eq(aiJobs.id, jobId));
}

export interface Charge {
  credits: number;
  daily: number;
  refunded: boolean;
}
/**
 * Charges a finished job `cost` credits (see jobCredits), or nothing when the system failed it:
 * from today's free credits first, then from earned credits. Never charges more than the user
 * has. Call inside a transaction holding lockUser, then store the returned figures on the job in
 * the same transaction.
 */
export async function chargeJob(
  tx: Transaction,
  userId: string,
  jobId: string,
  cost: number,
  refund: boolean,
): Promise<Charge> {
  if (refund) return { credits: 0, daily: 0, refunded: true };
  if (cost <= 0) return { credits: 0, daily: 0, refunded: false };
  const status = await creditStatus(tx, userId);
  const daily = Math.min(cost, status.dailyRemaining);
  const earned = Math.min(cost - daily, status.earned);
  if (earned > 0)
    await tx
      .insert(creditLedger)
      .values({ id: v7(), userId, delta: -earned, reason: "ai_spend", ref: jobId })
      .onConflictDoNothing();
  return { credits: daily + earned, daily, refunded: false };
}

/** Columns recording a charge and releasing the job's reservation. */
export const chargeColumns = (charge: Charge) => ({
  creditsReserved: 0,
  tokensReserved: 0,
  creditsCharged: charge.credits,
  dailyCreditsCharged: charge.daily,
});

async function grant(db: Executor, userId: string, delta: number, reason: string, ref: string) {
  const inserted = await db
    .insert(creditLedger)
    .values({ id: v7(), userId, delta, reason, ref })
    .onConflictDoNothing()
    .returning({ id: creditLedger.id });
  return inserted.length ? delta : 0;
}
/**
 * Rewards an author once per set when it becomes public and passes moderation. Copies of other
 * people's sets, very small sets, accounts under a day old and anything past the daily cap earn
 * nothing. Deleting a rewarded set takes the reward back (removeSet). Returns credits granted.
 */
export async function awardPublishCredit(
  db: Executor,
  set: { authorId: string; setId: string; cardCount: number; copiedFromId: string | null },
) {
  if (set.cardCount < MIN_PUBLIC_CARDS || set.copiedFromId) return 0;
  // Farming guards: brand-new accounts earn nothing, and only a few sets a day pay out.
  const { start } = quotaWindow();
  const [[author], [today]] = await Promise.all([
    db.select({ createdAt: user.createdAt }).from(user).where(eq(user.id, set.authorId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(creditLedger)
      .where(
        and(
          eq(creditLedger.userId, set.authorId),
          eq(creditLedger.reason, "publish_reward"),
          gte(creditLedger.createdAt, start),
        ),
      ),
  ]);
  if (!author || Date.now() - author.createdAt.getTime() < MIN_ACCOUNT_AGE_MS) return 0;
  if (today.count >= MAX_PUBLISH_REWARDS_PER_DAY) return 0;
  return grant(db, set.authorId, PUBLISH_REWARD, "publish_reward", set.setId);
}
/** Rewards an author when another person copies their public set: once per copier and set. */
export async function awardCopyCredit(
  db: Database,
  copy: { authorId: string; setId: string; copierId: string },
) {
  if (copy.authorId === copy.copierId) return 0;
  return db.transaction(async (tx) => {
    await lockUser(tx, copy.authorId);
    const { start } = quotaWindow();
    const [today] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(creditLedger)
      .where(
        and(
          eq(creditLedger.userId, copy.authorId),
          eq(creditLedger.reason, "copy_reward"),
          gte(creditLedger.createdAt, start),
        ),
      );
    if (today.count >= MAX_COPY_REWARDS_PER_DAY) return 0;
    return grant(tx, copy.authorId, COPY_REWARD, "copy_reward", `${copy.setId}:${copy.copierId}`);
  });
}
/** Takes back every reward a set earned when moderation removes it. Returns credits removed. */
export async function clawbackSetCredits(db: Database, authorId: string, setId: string) {
  return db.transaction(async (tx) => {
    await lockUser(tx, authorId);
    const [row] = await tx
      .select({ total: sql<number>`coalesce(sum(${creditLedger.delta}), 0)::int` })
      .from(creditLedger)
      .where(
        and(
          eq(creditLedger.userId, authorId),
          or(
            and(eq(creditLedger.reason, "publish_reward"), eq(creditLedger.ref, setId)),
            and(eq(creditLedger.reason, "copy_reward"), like(creditLedger.ref, `${setId}:%`)),
          ),
        ),
      );
    if (row.total <= 0) return 0;
    const removed = await grant(tx, authorId, -row.total, "clawback", setId);
    return removed ? -removed : 0;
  });
}
