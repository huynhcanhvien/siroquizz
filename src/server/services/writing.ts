import "server-only";
import { and, asc, desc, eq, lt, ne, sql } from "drizzle-orm";
import { v7 } from "uuid";
import { z } from "zod";
import { canListDocs, teaches } from "@/features/writing/lib/permissions";
import { CLOSED_SESSION_RETENTION_MS, MAX_SESSIONS_PER_CLASS } from "@/features/writing/lib/limits";
import { sessionInputSchema, sessionPatchSchema } from "@/features/writing/schemas";
import { ApiError } from "../api-error";
import type { Database } from "../db/client";
import { classMembers, classes, user, writingDocs, writingSessions } from "../db/schema";
import { requireMembership, requireTeaching } from "./classes";
import {
  docColumns,
  gateOf,
  requireSessionAccess,
  requireSessionTeacher,
  type DocRow,
  type SessionRow,
} from "./writing-access";

const iso = (date: Date | null) => date?.toISOString() ?? null;
export const toDocSummary = (doc: DocRow) => ({
  id: doc.id,
  authorId: doc.authorId,
  version: doc.version,
  textPreview: doc.textPreview,
  charCount: doc.charCount,
  lastEditorId: doc.lastEditorId,
  updatedAt: doc.updatedAt.toISOString(),
});
function toSummary(session: SessionRow, docCount: number, myDocId: string | null) {
  return {
    id: session.id,
    classId: session.classId,
    title: session.title,
    status: session.status,
    peerVisibility: session.peerVisibility,
    peerEditing: session.peerEditing,
    openedAt: iso(session.openedAt),
    closedAt: iso(session.closedAt),
    createdAt: session.createdAt.toISOString(),
    docCount,
    myDocId,
  };
}

/** The class's sessions, newest first; students do not see drafts. */
export async function listSessions(db: Database, userId: string, classId: string) {
  const { role } = await requireMembership(db, userId, classId);
  const rows = await db
    .select({
      session: writingSessions,
      docCount: sql<number>`(select count(*)::int from writing_docs d where d.session_id = ${writingSessions.id})`,
      myDocId: writingDocs.id,
    })
    .from(writingSessions)
    .leftJoin(
      writingDocs,
      and(eq(writingDocs.sessionId, writingSessions.id), eq(writingDocs.authorId, userId)),
    )
    .where(
      and(
        eq(writingSessions.classId, classId),
        teaches(role) ? undefined : ne(writingSessions.status, "draft"),
      ),
    )
    .orderBy(desc(writingSessions.createdAt));
  return rows.map((row) => toSummary(row.session, row.docCount, row.myDocId));
}

/** A teacher starts a session in draft; a class keeps at most MAX_SESSIONS_PER_CLASS. */
export async function createSession(db: Database, userId: string, classId: string, input: unknown) {
  const data = sessionInputSchema.parse(input);
  await requireTeaching(db, userId, classId);
  return db.transaction(async (tx) => {
    // Serializes the count and insert per class.
    await tx.select({ id: classes.id }).from(classes).where(eq(classes.id, classId)).for("update");
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(writingSessions)
      .where(eq(writingSessions.classId, classId));
    if (count >= MAX_SESSIONS_PER_CLASS) throw new ApiError(409, "CONFLICT");
    const [session] = await tx
      .insert(writingSessions)
      .values({ id: v7(), classId, createdBy: userId, ...data })
      .returning();
    return toSummary(session, 0, null);
  });
}

async function sessionMembers(db: Database, classId: string) {
  return db
    .select({
      userId: user.id,
      name: user.name,
      avatarColor: user.avatarColor,
      role: classMembers.role,
    })
    .from(classMembers)
    .innerJoin(user, eq(user.id, classMembers.userId))
    .where(eq(classMembers.classId, classId))
    .orderBy(asc(classMembers.role), asc(user.name));
}
const sessionDocs = (db: Database, sessionId: string) =>
  db
    .select(docColumns)
    .from(writingDocs)
    .where(eq(writingDocs.sessionId, sessionId))
    .orderBy(asc(writingDocs.createdAt));

/**
 * A session with the whole class (everyone's name and role, to colour each person's text) and,
 * when the viewer may list them, everyone's documents.
 */
export async function getSession(db: Database, userId: string, sessionId: string) {
  const { session, role } = await requireSessionAccess(db, userId, sessionId);
  const [[klass], members, docs] = await Promise.all([
    db.select({ name: classes.name }).from(classes).where(eq(classes.id, session.classId)),
    sessionMembers(db, session.classId),
    sessionDocs(db, session.id),
  ]);
  const mine = docs.find((doc) => doc.authorId === userId)?.id ?? null;
  const listed = canListDocs(role, gateOf(session));
  return {
    ...toSummary(session, docs.length, mine),
    prompt: session.prompt,
    className: klass.name,
    role,
    members,
    docs: listed ? docs.map(toDocSummary) : null,
  };
}

/** Changes settings; opening or closing stamps the time it happened. */
export async function updateSession(
  db: Database,
  userId: string,
  sessionId: string,
  input: unknown,
) {
  const patch = sessionPatchSchema.parse(input);
  const { session } = await requireSessionTeacher(db, userId, sessionId);
  const now = new Date();
  const peerVisibility = patch.peerVisibility ?? session.peerVisibility;
  const [updated] = await db
    .update(writingSessions)
    .set({
      ...patch,
      // Editing someone else's document needs being able to see it.
      ...(peerVisibility === "hidden" ? { peerEditing: false } : {}),
      ...(patch.status === "open" && session.status !== "open" ? { openedAt: now } : {}),
      ...(patch.status === "closed" && session.status !== "closed" ? { closedAt: now } : {}),
      ...(patch.status && patch.status !== "closed" ? { closedAt: null } : {}),
      updatedAt: now,
    })
    .where(eq(writingSessions.id, session.id))
    .returning();
  return toSummary(updated, 0, null);
}

export async function deleteSession(db: Database, userId: string, sessionId: string) {
  const { session } = await requireSessionTeacher(db, userId, sessionId);
  await db.delete(writingSessions).where(eq(writingSessions.id, session.id));
}

/** The database clock; document times are written by it too, so `since` comparisons agree. */
export async function databaseNow(db: Database): Promise<string> {
  const [row] = await db.execute<{ now: string }>(
    sql`select to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as now`,
  );
  return row.now;
}
const overviewQuery = z.object({ since: z.iso.datetime({ offset: true }).optional() });
/**
 * Documents changed since `since` (all of them without it), for the live roster. Returns the
 * server's clock so the next poll can ask from there; nothing when the viewer may not list.
 */
export async function sessionOverview(
  db: Database,
  userId: string,
  sessionId: string,
  query: URLSearchParams,
) {
  const { since } = overviewQuery.parse({ since: query.get("since") ?? undefined });
  const { session, role } = await requireSessionAccess(db, userId, sessionId);
  const serverTime = await databaseNow(db);
  if (!canListDocs(role, gateOf(session))) return { serverTime, docs: [] };
  const docs = await db
    .select(docColumns)
    .from(writingDocs)
    .where(
      and(
        eq(writingDocs.sessionId, session.id),
        since ? sql`${writingDocs.updatedAt} > ${since}::timestamptz` : undefined,
      ),
    )
    .orderBy(asc(writingDocs.updatedAt));
  return { serverTime, docs: docs.map(toDocSummary) };
}

/** Deletes sessions closed more than 180 days ago (with their documents); from the daily cron. */
export async function purgeClosedSessions(db: Database, now = new Date()) {
  const cutoff = new Date(now.getTime() - CLOSED_SESSION_RETENTION_MS);
  const removed = await db
    .delete(writingSessions)
    .where(and(eq(writingSessions.status, "closed"), lt(writingSessions.closedAt, cutoff)))
    .returning({ id: writingSessions.id });
  return removed.length;
}
