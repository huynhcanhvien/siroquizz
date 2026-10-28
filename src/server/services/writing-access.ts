import "server-only";
import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import {
  canReadDoc,
  canWriteDoc,
  teaches,
  type SessionGate,
} from "@/features/writing/lib/permissions";
import { ApiError } from "../api-error";
import { classMembers, writingDocs, writingSessions } from "../db/schema";
import type { ClassRole } from "./classes";
import type { Db } from "./sets";

export type SessionRow = typeof writingSessions.$inferSelect;
/** A document without its (possibly large) Yjs state. */
export const docColumns = {
  id: writingDocs.id,
  sessionId: writingDocs.sessionId,
  authorId: writingDocs.authorId,
  version: writingDocs.version,
  textPreview: writingDocs.textPreview,
  charCount: writingDocs.charCount,
  lastEditorId: writingDocs.lastEditorId,
  updatedAt: writingDocs.updatedAt,
};
export type DocRow = Omit<typeof writingDocs.$inferSelect, "state" | "createdAt">;

const notFound = () => new ApiError(404, "NOT_FOUND");
/** The document author's membership, to tell a classmate's document from a teacher's own. */
const authorMembers = alias(classMembers, "author_members");
const parseId = (id: string) => {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) throw notFound();
  return parsed.data;
};
export const gateOf = (session: SessionRow): SessionGate => ({
  status: session.status,
  peerVisibility: session.peerVisibility,
  peerEditing: session.peerEditing,
});

/**
 * The session and the viewer's role in its class. Non-members, unknown ids and (for students)
 * sessions still in draft all look like 404, so nothing can be enumerated.
 */
export async function requireSessionAccess(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<{ session: SessionRow; role: ClassRole }> {
  const [row] = await db
    .select({ session: writingSessions, role: classMembers.role })
    .from(writingSessions)
    .innerJoin(
      classMembers,
      and(eq(classMembers.classId, writingSessions.classId), eq(classMembers.userId, userId)),
    )
    .where(eq(writingSessions.id, parseId(sessionId)))
    .limit(1);
  if (!row || (!teaches(row.role) && row.session.status === "draft")) throw notFound();
  return row;
}

/** Like requireSessionAccess, and the viewer must teach the class (403 otherwise). */
export async function requireSessionTeacher(db: Db, userId: string, sessionId: string) {
  const access = await requireSessionAccess(db, userId, sessionId);
  if (!teaches(access.role)) throw new ApiError(403, "FORBIDDEN");
  return access;
}

/**
 * A document the viewer may read (404 otherwise) or write: writing to a closed session is
 * SESSION_CLOSED, anything else not allowed is FORBIDDEN.
 */
export async function requireDocAccess(
  db: Db,
  userId: string,
  docId: string,
  mode: "read" | "write",
): Promise<{
  doc: DocRow;
  session: SessionRow;
  role: ClassRole;
  authorRole: ClassRole | null;
  canWrite: boolean;
}> {
  const [row] = await db
    .select({
      doc: docColumns,
      session: writingSessions,
      role: classMembers.role,
      authorRole: authorMembers.role,
    })
    .from(writingDocs)
    .innerJoin(writingSessions, eq(writingSessions.id, writingDocs.sessionId))
    .innerJoin(
      classMembers,
      and(eq(classMembers.classId, writingSessions.classId), eq(classMembers.userId, userId)),
    )
    .leftJoin(
      authorMembers,
      and(
        eq(authorMembers.classId, writingSessions.classId),
        eq(authorMembers.userId, writingDocs.authorId),
      ),
    )
    .where(eq(writingDocs.id, parseId(docId)))
    .limit(1);
  if (!row) throw notFound();
  const gate = gateOf(row.session);
  if (!canReadDoc(row.role, userId, row.doc.authorId, gate)) throw notFound();
  const canWrite = canWriteDoc(row.role, userId, row.doc.authorId, gate, row.authorRole);
  if (mode === "write" && !canWrite)
    throw new ApiError(403, gate.status === "closed" ? "SESSION_CLOSED" : "FORBIDDEN");
  return { ...row, canWrite };
}
