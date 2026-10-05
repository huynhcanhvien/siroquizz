import "server-only";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "../api-error";
import { studySets, user } from "../db/schema";
import type { Db } from "./sets";

/**
 * Every "who may see or change what" rule lives here so routes never improvise permissions.
 * Each rule has an integration test per role (owner, other user, guest, admin).
 */
export type SetRow = typeof studySets.$inferSelect;
export interface SetAccessContext {
  /** The owner was banned by a moderator: their sets disappear for everyone else. */
  ownerBanned?: boolean;
  /** The viewer is a moderator, who may inspect anything that was reported or flagged. */
  viewerIsAdmin?: boolean;
}

/** Whether `viewerId` (null for a guest) may open the set and study it. */
export function canViewSet(viewerId: string | null, set: SetRow, context: SetAccessContext = {}) {
  if (set.deletedAt) return false;
  if (viewerId !== null && viewerId === set.ownerId) return true;
  if (context.viewerIsAdmin) return true;
  if (set.hiddenAt || context.ownerBanned) return false;
  if (set.visibility === "unlisted") return true;
  // A public set is reachable by its link unless moderation found a problem with it.
  if (set.visibility === "public")
    return set.moderationStatus === "pending" || set.moderationStatus === "approved";
  return false;
}
/** Only the owner edits, deletes or changes who can see a set. */
export const canEditSet = (viewerId: string | null, set: SetRow) =>
  viewerId !== null && viewerId === set.ownerId && !set.deletedAt;
/** Shown on Explore and profiles: public, approved by moderation and not taken down. */
export const isListed = (set: SetRow, context: SetAccessContext = {}) =>
  !set.deletedAt &&
  !set.hiddenAt &&
  !context.ownerBanned &&
  set.visibility === "public" &&
  set.moderationStatus === "approved";

/** Moderator check against the database, never the (up to five minutes old) session cookie. */
export async function isAdmin(db: Db, userId: string) {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        eq(user.id, userId),
        eq(user.role, "admin"),
        isNull(user.bannedAt),
        isNull(user.deletedAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}
export async function requireAdmin(db: Db, userId: string) {
  if (!(await isAdmin(db, userId))) throw new ApiError(403, "FORBIDDEN");
}

/** The set is assigned to a class the person belongs to (as student or teacher). */
export const assignedTo = (userId: string) =>
  sql`exists(select 1 from class_sets cs inner join class_members cm on cm.class_id = cs.class_id where cs.set_id = ${studySets.id} and cm.user_id = ${userId})`;
/**
 * A set the person may study and record progress on: their own, or one assigned to a class they
 * are in (unless a moderator hid it). Leaving the class removes the access at once. Editing,
 * deleting and sharing stay with the owner (requireOwnedSet).
 */
export async function requireStudySet(db: Db, userId: string, setId: string, lock = false) {
  const query = db
    .select()
    .from(studySets)
    .where(
      and(
        eq(studySets.id, z.uuid().parse(setId)),
        isNull(studySets.deletedAt),
        or(eq(studySets.ownerId, userId), and(isNull(studySets.hiddenAt), assignedTo(userId))),
      ),
    )
    .limit(1);
  const [set] = await (lock ? query.for("update") : query);
  if (!set) throw new ApiError(404, "NOT_FOUND");
  return set;
}
