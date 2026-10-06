import { lockAdminChange } from "./access";
import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { v7 } from "uuid";
import { z } from "zod";
import { ApiError } from "../api-error";
import type { Database } from "../db/client";
import { reports, session, studySets, user } from "../db/schema";
import { canViewSet } from "./access";
import { applySetAction, audit } from "./moderation";

export const REPORT_REASONS = ["spam", "inappropriate", "copyright", "other"] as const;
/** Reports one person may file per day, to keep the queue from being flooded. */
const MAX_REPORTS_PER_DAY = 10;
const reportSchema = z.object({
  targetType: z.enum(["set", "user"]),
  targetId: z.string().min(1).max(64),
  reason: z.enum(REPORT_REASONS),
  note: z.string().trim().max(500).default(""),
});

/** Files a report about a set the reporter can see, or about its author. Repeats are ignored. */
export async function createReport(db: Database, reporterId: string, input: unknown) {
  const data = reportSchema.parse(input);
  if (data.targetType === "set") {
    const [set] = await db
      .select()
      .from(studySets)
      .where(eq(studySets.id, z.uuid().parse(data.targetId)))
      .limit(1);
    if (!set || !canViewSet(reporterId, set) || set.ownerId === reporterId)
      throw new ApiError(404, "NOT_FOUND");
  } else {
    const [target] = await db.select({ id: user.id }).from(user).where(eq(user.id, data.targetId));
    if (!target || target.id === reporterId) throw new ApiError(404, "NOT_FOUND");
  }
  const [today] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reports)
    .where(
      and(
        eq(reports.reporterId, reporterId),
        gte(reports.createdAt, new Date(Date.now() - 86400_000)),
      ),
    );
  if (today.count >= MAX_REPORTS_PER_DAY) throw new ApiError(429, "RATE_LIMITED");
  await db
    .insert(reports)
    .values({ id: v7(), reporterId, ...data })
    .onConflictDoNothing();
}

/** Open reports for moderators, newest first, with what they point at. */
export async function listOpenReports(db: Database) {
  const rows = await db
    .select({
      id: reports.id,
      targetType: reports.targetType,
      targetId: reports.targetId,
      reason: reports.reason,
      note: reports.note,
      createdAt: reports.createdAt,
      setTitle: studySets.title,
      setSlug: studySets.slug,
      setHidden: sql<boolean>`${studySets.hiddenAt} is not null`,
      userName: user.name,
      userBanned: sql<boolean>`${user.bannedAt} is not null`,
    })
    .from(reports)
    .leftJoin(
      studySets,
      and(eq(reports.targetType, "set"), sql`${studySets.id}::text = ${reports.targetId}`),
    )
    .leftJoin(
      user,
      sql`${user.id} = case when ${reports.targetType} = 'user' then ${reports.targetId} else ${studySets.ownerId} end`,
    )
    .where(eq(reports.status, "open"))
    .orderBy(desc(reports.createdAt))
    .limit(100);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

const resolveSchema = z.object({ action: z.enum(["dismiss", "hide", "ban"]) });
/**
 * A moderator's decision on a report: dismiss it, hide the reported set (taking back its
 * credits) or ban the account behind it. Every open report on the same target is closed.
 */
export async function resolveReport(
  db: Database,
  adminId: string,
  reportId: string,
  input: unknown,
) {
  const { action } = resolveSchema.parse(input);
  const [report] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.id, z.uuid().parse(reportId)), eq(reports.status, "open")))
    .limit(1);
  if (!report) throw new ApiError(404, "NOT_FOUND");
  if (action === "hide") {
    if (report.targetType !== "set") throw new ApiError(400, "VALIDATION_ERROR");
    await applySetAction(db, adminId, report.targetId, "hide", `report:${report.reason}`);
  }
  if (action === "ban") {
    const userId =
      report.targetType === "user"
        ? report.targetId
        : (
            await db
              .select({ ownerId: studySets.ownerId })
              .from(studySets)
              .where(sql`${studySets.id}::text = ${report.targetId}`)
          )[0]?.ownerId;
    if (!userId) throw new ApiError(404, "NOT_FOUND");
    await setBanned(db, adminId, userId, true);
  }
  await db
    .update(reports)
    .set({
      status: action === "dismiss" ? "dismissed" : "actioned",
      handledBy: adminId,
      handledAt: new Date(),
    })
    .where(
      and(
        eq(reports.targetType, report.targetType),
        eq(reports.targetId, report.targetId),
        eq(reports.status, "open"),
      ),
    );
  await audit(db, {
    actorId: adminId,
    action: `report_${action}`,
    targetType: report.targetType as "set" | "user",
    targetId: report.targetId,
    meta: { reportId },
  });
}

/** Locks or unlocks an account. A lock signs the person out everywhere at once. */
export async function setBanned(db: Database, adminId: string, userId: string, banned: boolean) {
  if (userId === adminId) throw new ApiError(400, "VALIDATION_ERROR");
  await db.transaction(async (tx) => {
    await lockAdminChange(tx, adminId);
    const updated = await tx
      .update(user)
      .set({ bannedAt: banned ? new Date() : null, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .returning({ id: user.id });
    if (!updated.length) throw new ApiError(404, "NOT_FOUND");
    if (banned) await tx.delete(session).where(eq(session.userId, userId));
    await audit(tx, {
      actorId: adminId,
      action: banned ? "user_ban" : "user_unban",
      targetType: "user",
      targetId: userId,
    });
  });
}
