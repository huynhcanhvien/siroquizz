import "server-only";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "../api-error";
import { classLibraryItems, classMembers, classes, studySets, user } from "../db/schema";
import type { Db } from "./sets";

/**
 * Every "who may see or change what" rule lives here so routes never improvise permissions.
 * Each rule has an integration test per role (owner, other user, guest, admin).
 */
export type SetRow = typeof studySets.$inferSelect;
export interface SetAccessContext {
  /** The owner was banned or deleted their account: their sets disappear for everyone else. */
  ownerBanned?: boolean;
  /** The viewer is a moderator, who may inspect anything that was reported or flagged. */
  viewerIsAdmin?: boolean;
}

/** Whether `viewerId` (null for a guest) may open the set and study it. */
export function canViewSet(viewerId: string | null, set: SetRow, context: SetAccessContext = {}) {
  if (set.deletedAt) return false;
  if (viewerId !== null && viewerId === set.ownerId) return true;
  if (set.visibility === "private") return false;
  // Moderators review anything that was shared, including what they took down.
  if (context.viewerIsAdmin) return true;
  if (set.hiddenAt || context.ownerBanned) return false;
  // A verdict against the content closes every shared link until the owner changes it.
  if (set.moderationStatus === "flagged" || set.moderationStatus === "rejected") return false;
  return true;
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
 * Shared sets anyone signed in may study by link, under the same rules as viewing them: not
 * hidden, owner not banned, and a public set not flagged or rejected by moderation.
 */
export const sharedForStudy = () =>
  and(
    isNull(studySets.hiddenAt),
    inArray(studySets.visibility, ["unlisted", "public"]),
    inArray(studySets.moderationStatus, ["none", "pending", "approved"]),
    ownerInGoodStanding(),
  );
/** The set's owner is neither banned nor gone (account deletion purges after 30 days). */
export const ownerInGoodStanding = () =>
  sql`not exists(select 1 from "user" u where u.id = ${studySets.ownerId} and (u.banned_at is not null or u.deleted_at is not null))`;
/**
 * Shared into a class the viewer belongs to: the set itself, or a folder holding it. A
 * teachers-only share needs a teaching role; the folder's sets are its owner's own sets.
 */
export const sharedToClassOf = (userId: string) =>
  sql`exists(select 1 from class_library_items li
    inner join class_members cm on cm.class_id = li.class_id and cm.user_id = ${userId}
    where (li.audience = 'class' or cm.role in ('owner', 'teacher'))
      and ((li.item_type = 'set' and li.item_id = ${studySets.id})
        or (li.item_type = 'folder' and exists(select 1 from folder_sets fs
          where fs.folder_id = li.item_id and fs.set_id = ${studySets.id}))))`;
/** Edit rights the owner granted: to the person, or to every teacher of a class they teach. */
export const collaboratorOn = (userId: string) =>
  sql`exists(select 1 from set_collaborators sc where sc.set_id = ${studySets.id} and (
    (sc.principal_type = 'user' and sc.principal_id = ${userId})
    or (sc.principal_type = 'class_teachers' and exists(select 1 from class_members cm
      where cm.class_id::text = sc.principal_id and cm.user_id = ${userId}
        and cm.role in ('owner', 'teacher')))))`;
/**
 * Row lock taken on the set: `"update"` for edits and deletion (excludes everything else),
 * `"share"` (FOR KEY SHARE) for progress writes, which then run side by side while still
 * holding off an edit or deletion of the set until they commit.
 */
export type SetLock = false | "update" | "share";
export const lockStrength = (lock: "update" | "share") =>
  lock === "update" ? ("update" as const) : ("key share" as const);
/**
 * A set the person may study and record progress on: their own, one assigned or shared to a class
 * they are in, one they may edit as a collaborator, or one shared by link (unless a moderator hid
 * it). Leaving the class or unsharing removes the access at once. Deleting and sharing stay with
 * the owner (requireOwnedSet); editing also allows collaborators (requireEditableSet).
 */
export async function requireStudySet(
  db: Db,
  userId: string,
  setId: string,
  lock: SetLock = false,
) {
  const query = db
    .select()
    .from(studySets)
    .where(
      and(
        eq(studySets.id, z.uuid().parse(setId)),
        isNull(studySets.deletedAt),
        or(
          eq(studySets.ownerId, userId),
          and(
            isNull(studySets.hiddenAt),
            or(assignedTo(userId), sharedToClassOf(userId), collaboratorOn(userId)),
            ownerInGoodStanding(),
          ),
          sharedForStudy(),
        ),
      ),
    )
    .limit(1);
  const [set] = await (lock ? query.for(lockStrength(lock)) : query);
  if (!set) throw new ApiError(404, "NOT_FOUND");
  return set;
}

/** Whether the owner granted `userId` edit rights on the set (directly or as a class teacher). */
export async function isCollaborator(db: Db, userId: string, setId: string) {
  const [row] = await db
    .select({ id: studySets.id })
    .from(studySets)
    .where(and(eq(studySets.id, z.uuid().parse(setId)), collaboratorOn(userId)))
    .limit(1);
  return Boolean(row);
}
/** A set the person may change: theirs, or one they were made a collaborator on (else 403). */
export async function requireEditableSet(
  db: Db,
  userId: string,
  setId: string,
  lock: SetLock = false,
) {
  const set = await requireStudySet(db, userId, setId, lock);
  if (set.ownerId !== userId && !(await isCollaborator(db, userId, setId)))
    throw new ApiError(403, "FORBIDDEN");
  return set;
}
export interface SharedInContext {
  classId: string;
  className: string;
  sharedByName: string;
  audience: "teachers" | "class";
}
/** The first class (by share time) through which the viewer sees the set, for its badge. */
export async function sharedInContext(
  db: Db,
  userId: string,
  setId: string,
): Promise<SharedInContext | null> {
  const [row] = await db
    .select({
      classId: classes.id,
      className: classes.name,
      sharedByName: user.name,
      audience: classLibraryItems.audience,
    })
    .from(classLibraryItems)
    .innerJoin(classes, eq(classes.id, classLibraryItems.classId))
    .innerJoin(
      classMembers,
      and(eq(classMembers.classId, classLibraryItems.classId), eq(classMembers.userId, userId)),
    )
    .innerJoin(user, eq(user.id, classLibraryItems.sharedBy))
    .where(
      and(
        or(
          eq(classLibraryItems.audience, "class"),
          inArray(classMembers.role, ["owner", "teacher"]),
        ),
        or(
          and(eq(classLibraryItems.itemType, "set"), eq(classLibraryItems.itemId, setId)),
          and(
            eq(classLibraryItems.itemType, "folder"),
            sql`exists(select 1 from folder_sets fs where fs.folder_id = ${classLibraryItems.itemId} and fs.set_id = ${setId})`,
          ),
        ),
      ),
    )
    .orderBy(classLibraryItems.sharedAt)
    .limit(1);
  return row ?? null;
}

/** Serialize permission changes, then recheck the actor after any concurrent demotion/ban. */
export async function lockAdminChange(tx: Db, adminId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(735174, 1)`);
  await requireAdmin(tx, adminId);
}
