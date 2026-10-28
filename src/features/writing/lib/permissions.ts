import type { ClassRole } from "@/features/classes/schemas";

/** The session settings that decide who may read and write which document. */
export interface SessionGate {
  status: "draft" | "open" | "closed";
  peerVisibility: "hidden" | "open";
  peerEditing: boolean;
}

/** Whether two sets of session settings are the same. */
export const sameGate = (a: SessionGate, b: SessionGate): boolean =>
  a.status === b.status && a.peerVisibility === b.peerVisibility && a.peerEditing === b.peerEditing;

/** Owners and co-teachers run sessions; students write in them. */
export const teaches = (role: ClassRole): boolean => role !== "student";

/**
 * Teachers read every document, even before the session opens. Authors read their own once the
 * session is open (or closed); classmates only when the teacher opened documents to peers.
 */
export function canReadDoc(
  role: ClassRole,
  userId: string,
  authorId: string,
  session: SessionGate,
): boolean {
  if (teaches(role)) return true;
  if (session.status === "draft") return false;
  return userId === authorId || session.peerVisibility === "open";
}

/**
 * Writing needs an open session. Teachers and the author may always write then; classmates only
 * when documents are open to peers and peer editing is on, and only in another student's
 * document (`authorRole`; null when the author left the class), never in a teacher's own.
 */
export function canWriteDoc(
  role: ClassRole,
  userId: string,
  authorId: string,
  session: SessionGate,
  authorRole: ClassRole | null,
): boolean {
  if (session.status !== "open") return false;
  if (teaches(role) || userId === authorId) return true;
  return authorRole === "student" && session.peerVisibility === "open" && session.peerEditing;
}

/** Whether the viewer may see the list of everyone's documents. */
export const canListDocs = (role: ClassRole, session: SessionGate): boolean =>
  teaches(role) || session.peerVisibility === "open";
