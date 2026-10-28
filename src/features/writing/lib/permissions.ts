import type { ClassRole } from "@/features/classes/schemas";

/** The session settings that decide who may read and write which document. */
export interface SessionGate {
  status: "draft" | "open" | "closed";
  peerVisibility: "hidden" | "open";
  peerEditing: boolean;
}

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
 * when documents are open to peers and peer editing is on.
 */
export function canWriteDoc(
  role: ClassRole,
  userId: string,
  authorId: string,
  session: SessionGate,
): boolean {
  if (session.status !== "open") return false;
  if (teaches(role) || userId === authorId) return true;
  return session.peerVisibility === "open" && session.peerEditing;
}

/** Whether the viewer may see the list of everyone's documents. */
export const canListDocs = (role: ClassRole, session: SessionGate): boolean =>
  teaches(role) || session.peerVisibility === "open";
