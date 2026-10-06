import "server-only";
import { count, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { ACTIVE_JOB_STATUSES, globalTokensToday, quotaWindow } from "../../ai/credits";
import type { Database } from "../../db/client";
import { aiJobs, reports, studySets, user } from "../../db/schema";
import { getServerEnv } from "../../env";

const WEEK_MS = 7 * 86400_000;
const filtered = (condition: ReturnType<typeof sql>) =>
  sql<number>`(count(*) filter (where ${condition}))::int`;

/** Headline numbers for the admin home; each figure is one aggregate query, run in parallel. */
export async function adminOverview(db: Database) {
  const weekAgo = new Date(Date.now() - WEEK_MS);
  const { start } = quotaWindow();
  const [[users], [sets], [jobs], [running], [openReports], tokensUsed] = await Promise.all([
    db
      .select({
        total: count(),
        newThisWeek: filtered(sql`${user.createdAt} >= ${weekAgo.toISOString()}::timestamptz`),
        banned: filtered(sql`${user.bannedAt} is not null`),
        admins: filtered(sql`${user.role} = 'admin'`),
      })
      .from(user)
      .where(isNull(user.deletedAt)),
    db
      .select({
        public: filtered(sql`${studySets.visibility} = 'public' and ${studySets.hiddenAt} is null`),
        awaitingReview: filtered(
          sql`${studySets.visibility} = 'public' and ${studySets.moderationStatus} in ('flagged', 'pending')`,
        ),
        hidden: filtered(sql`${studySets.hiddenAt} is not null`),
      })
      .from(studySets)
      .where(isNull(studySets.deletedAt)),
    db
      .select({
        today: count(),
        failed: filtered(sql`${aiJobs.status} = 'error'`),
        creditsCharged: sql<number>`coalesce(sum(${aiJobs.creditsCharged}), 0)::int`,
      })
      .from(aiJobs)
      .where(gte(aiJobs.createdAt, start)),
    db.select({ count: count() }).from(aiJobs).where(inArray(aiJobs.status, ACTIVE_JOB_STATUSES)),
    db.select({ count: count() }).from(reports).where(eq(reports.status, "open")),
    globalTokensToday(db),
  ]);
  return {
    users,
    sets,
    jobs: { ...jobs, running: running.count },
    openReports: openReports.count,
    tokens: { used: tokensUsed, limit: getServerEnv().AI_GLOBAL_DAILY_TOKENS },
  };
}
