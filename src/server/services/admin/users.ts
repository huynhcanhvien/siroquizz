import "server-only";
import { and, count, desc, eq, ilike, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "../../api-error";
import { creditStatus } from "../../ai/credits";
import type { Database } from "../../db/client";
import { aiJobs, creditLedger, reports, studySets, user } from "../../db/schema";
import { audit } from "../moderation";
import { lockAdminChange } from "../access";
import {
  ADMIN_PAGE_SIZE,
  containsPattern,
  roleInput,
  toPage,
  userListQuery,
  parseQuery,
} from "./schemas";

const DETAIL_ROWS = 20;
// Never select password hashes, tokens or anything from `account` / `session`.
const userColumns = {
  id: user.id,
  name: user.name,
  email: user.email,
  username: user.username,
  role: user.role,
  emailVerified: user.emailVerified,
  bannedAt: user.bannedAt,
  deletedAt: user.deletedAt,
  createdAt: user.createdAt,
};

/** Every account, newest first, optionally matching email, name or username. */
export async function listUsers(db: Database, params: URLSearchParams) {
  const { q, cursor } = parseQuery(userListQuery, params);
  const pattern = q ? containsPattern(q) : null;
  const rows = await db
    .select(userColumns)
    .from(user)
    .where(
      and(
        cursor ? lt(user.id, cursor) : undefined,
        pattern
          ? or(ilike(user.email, pattern), ilike(user.name, pattern), ilike(user.username, pattern))
          : undefined,
      ),
    )
    .orderBy(desc(user.id))
    .limit(ADMIN_PAGE_SIZE + 1);
  return toPage(rows);
}

/** One account with its credits, recent AI jobs, sets, ledger and open reports against it. */
export async function getUserDetail(db: Database, userId: string) {
  const id = z.uuid().parse(userId);
  const [account] = await db.select(userColumns).from(user).where(eq(user.id, id)).limit(1);
  if (!account) throw new ApiError(404, "NOT_FOUND");
  const [credits, jobs, sets, ledger, [openReports]] = await Promise.all([
    creditStatus(db, id),
    db
      .select({
        id: aiJobs.id,
        status: aiJobs.status,
        prompt: sql<string>`left(${aiJobs.prompt}, 120)`,
        creditsCharged: aiJobs.creditsCharged,
        errorCode: aiJobs.errorCode,
        createdAt: aiJobs.createdAt,
      })
      .from(aiJobs)
      .where(eq(aiJobs.userId, id))
      .orderBy(desc(aiJobs.createdAt))
      .limit(DETAIL_ROWS),
    db
      .select({
        id: studySets.id,
        title: studySets.title,
        slug: studySets.slug,
        visibility: studySets.visibility,
        moderationStatus: studySets.moderationStatus,
        hiddenAt: studySets.hiddenAt,
        cardCount: studySets.cardCount,
        updatedAt: studySets.updatedAt,
      })
      .from(studySets)
      .where(and(eq(studySets.ownerId, id), sql`${studySets.deletedAt} is null`))
      .orderBy(desc(studySets.updatedAt))
      .limit(DETAIL_ROWS),
    db
      .select({
        id: creditLedger.id,
        delta: creditLedger.delta,
        reason: creditLedger.reason,
        createdAt: creditLedger.createdAt,
      })
      .from(creditLedger)
      .where(eq(creditLedger.userId, id))
      .orderBy(desc(creditLedger.createdAt))
      .limit(DETAIL_ROWS),
    db
      .select({ count: count() })
      .from(reports)
      .where(
        and(eq(reports.targetType, "user"), eq(reports.targetId, id), eq(reports.status, "open")),
      ),
  ]);
  return { user: account, credits, jobs, sets, ledger, openReports: openReports.count };
}

/**
 * Grants or removes the admin role. Changes are serialized and the acting admin is rechecked
 * inside the transaction, so concurrent revocations cannot remove the last admin. Locked or deleted accounts cannot be
 * made admins.
 */
export async function setRole(db: Database, adminId: string, userId: string, input: unknown) {
  const id = z.uuid().parse(userId);
  const { role } = roleInput.parse(input);
  if (id === adminId) throw new ApiError(400, "VALIDATION_ERROR");
  await db.transaction(async (tx) => {
    await lockAdminChange(tx, adminId);
    const [target] = await tx
      .select({ role: user.role, bannedAt: user.bannedAt, deletedAt: user.deletedAt })
      .from(user)
      .where(eq(user.id, id))
      .for("update");
    if (!target) throw new ApiError(404, "NOT_FOUND");
    if (role === "admin" && (target.bannedAt || target.deletedAt))
      throw new ApiError(400, "VALIDATION_ERROR");
    if (target.role === role) return;
    if (target.role === "admin" && role === "user") {
      const [admins] = await tx.select({ count: count() }).from(user).where(eq(user.role, "admin"));
      if (admins.count <= 1) throw new ApiError(400, "VALIDATION_ERROR");
    }
    await tx.update(user).set({ role, updatedAt: new Date() }).where(eq(user.id, id));
    await audit(tx, {
      actorId: adminId,
      action: role === "admin" ? "user_grant_admin" : "user_revoke_admin",
      targetType: "user",
      targetId: id,
    });
  });
}
