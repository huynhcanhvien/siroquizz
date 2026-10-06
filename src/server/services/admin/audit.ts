import "server-only";
import { and, desc, eq, lt } from "drizzle-orm";
import type { Database } from "../../db/client";
import { auditLogs, user } from "../../db/schema";
import { ADMIN_PAGE_SIZE, auditListQuery, parseQuery, toPage } from "./schemas";

/** Moderator and system actions, newest first, filterable by action, actor and target. */
export async function listAudit(db: Database, params: URLSearchParams) {
  const { action, actorId, targetId, cursor } = parseQuery(auditListQuery, params);
  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      actorId: auditLogs.actorId,
      actorName: user.name,
      targetType: auditLogs.targetType,
      targetId: auditLogs.targetId,
      meta: auditLogs.meta,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(user, eq(user.id, auditLogs.actorId))
    .where(
      and(
        action ? eq(auditLogs.action, action) : undefined,
        actorId ? eq(auditLogs.actorId, actorId) : undefined,
        targetId ? eq(auditLogs.targetId, targetId) : undefined,
        cursor ? lt(auditLogs.id, cursor) : undefined,
      ),
    )
    .orderBy(desc(auditLogs.id))
    .limit(ADMIN_PAGE_SIZE + 1);
  return toPage(rows);
}
