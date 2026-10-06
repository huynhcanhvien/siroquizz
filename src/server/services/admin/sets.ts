import "server-only";
import { and, desc, eq, ilike, isNotNull, isNull, lt, ne, or } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/client";
import { auditLogs, studySets, user } from "../../db/schema";
import { ADMIN_PAGE_SIZE, containsPattern, parseQuery, setListQuery, toPage } from "./schemas";

const HISTORY_ROWS = 50;

/**
 * Shared sets (public or unlisted) plus any set a moderator hid, newest first. Private sets stay
 * out of reach unless moderation already touched them.
 */
export async function listAdminSets(db: Database, params: URLSearchParams) {
  const { q, status, cursor } = parseQuery(setListQuery, params);
  const rows = await db
    .select({
      id: studySets.id,
      title: studySets.title,
      slug: studySets.slug,
      visibility: studySets.visibility,
      moderationStatus: studySets.moderationStatus,
      moderationReason: studySets.moderationReason,
      hiddenAt: studySets.hiddenAt,
      cardCount: studySets.cardCount,
      ownerId: studySets.ownerId,
      ownerName: user.name,
      createdAt: studySets.createdAt,
    })
    .from(studySets)
    .innerJoin(user, eq(user.id, studySets.ownerId))
    .where(
      and(
        isNull(studySets.deletedAt),
        or(ne(studySets.visibility, "private"), isNotNull(studySets.hiddenAt)),
        status === "hidden"
          ? isNotNull(studySets.hiddenAt)
          : status
            ? eq(studySets.moderationStatus, status)
            : undefined,
        q ? ilike(studySets.title, containsPattern(q)) : undefined,
        cursor ? lt(studySets.id, cursor) : undefined,
      ),
    )
    .orderBy(desc(studySets.id))
    .limit(ADMIN_PAGE_SIZE + 1);
  return toPage(rows);
}

/** Automatic and moderator decisions on one set, newest first. */
export function setHistory(db: Database, setId: string) {
  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      actorId: auditLogs.actorId,
      actorName: user.name,
      meta: auditLogs.meta,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(user, eq(user.id, auditLogs.actorId))
    .where(and(eq(auditLogs.targetType, "set"), eq(auditLogs.targetId, z.uuid().parse(setId))))
    .orderBy(desc(auditLogs.id))
    .limit(HISTORY_ROWS);
}
