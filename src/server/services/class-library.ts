import "server-only";
import { and, desc, eq, inArray, isNull, ne, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { v7 } from "uuid";
import { z } from "zod";
import { ApiError } from "../api-error";
import type { Database } from "../db/client";
import { classLibraryItems, classMembers, classes, folders, studySets, user } from "../db/schema";
import { ownerInGoodStanding } from "./access";
import { canManageClass, requireMembership, type ClassRole } from "./classes";
import { requireFolder } from "./folders";
import { requireOwnedSet, type Db } from "./sets";

export const MAX_LIBRARY_ITEMS_PER_CLASS = 500;
const MY_LIBRARY_LIMIT = 200;
const itemTypeSchema = z.enum(["set", "folder"]);
type ItemType = z.infer<typeof itemTypeSchema>;
const shareInput = z.object({
  itemType: itemTypeSchema,
  itemId: z.uuid(),
  audience: z.enum(["teachers", "class"]).default("class"),
});

export interface ClassLibraryItem {
  id: string;
  itemType: ItemType;
  itemId: string;
  title: string;
  cardCount: number | null;
  setCount: number | null;
  audience: "teachers" | "class";
  sharedAt: string;
  sharedBy: { id: string; name: string; avatarColor: string };
  canRemove: boolean;
}
export type MyClassLibraryItem = ClassLibraryItem & { classId: string; className: string };

/** Only the owner of a set or folder shares it (404 for anything else, no enumeration). */
async function requireOwnedItem(db: Db, userId: string, itemType: ItemType, itemId: string) {
  if (itemType === "set") await requireOwnedSet(db, userId, itemId);
  else await requireFolder(db, userId, itemId);
}

/** Shares one's own set or folder into a class one belongs to; re-sharing changes the audience. */
export async function shareToClass(db: Database, userId: string, classId: string, input: unknown) {
  const data = shareInput.parse(input);
  return db.transaction(async (tx) => {
    await requireMembership(tx, userId, classId);
    await requireOwnedItem(tx, userId, data.itemType, data.itemId);
    // Serializes the count check with other shares into this class.
    await tx.select({ id: classes.id }).from(classes).where(eq(classes.id, classId)).for("update");
    const [existing] = await tx
      .select({ id: classLibraryItems.id })
      .from(classLibraryItems)
      .where(
        and(
          eq(classLibraryItems.classId, classId),
          eq(classLibraryItems.itemType, data.itemType),
          eq(classLibraryItems.itemId, data.itemId),
        ),
      );
    if (existing) {
      await tx
        .update(classLibraryItems)
        .set({ audience: data.audience })
        .where(eq(classLibraryItems.id, existing.id));
      return { id: existing.id };
    }
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(classLibraryItems)
      .where(eq(classLibraryItems.classId, classId));
    if (count >= MAX_LIBRARY_ITEMS_PER_CLASS) throw new ApiError(409, "CONFLICT");
    const id = v7();
    await tx.insert(classLibraryItems).values({ id, classId, ...data, sharedBy: userId });
    return { id };
  });
}

/** The sharer or a teacher takes an item out of the class library. */
export async function unshareFromClass(
  db: Database,
  userId: string,
  classId: string,
  libraryItemId: string,
) {
  const { role } = await requireMembership(db, userId, classId);
  const [item] = await db
    .select({ sharedBy: classLibraryItems.sharedBy })
    .from(classLibraryItems)
    .where(
      and(
        eq(classLibraryItems.id, z.uuid().parse(libraryItemId)),
        eq(classLibraryItems.classId, classId),
      ),
    );
  if (!item) throw new ApiError(404, "NOT_FOUND");
  if (item.sharedBy !== userId && !canManageClass(role)) throw new ApiError(403, "FORBIDDEN");
  await db.delete(classLibraryItems).where(eq(classLibraryItems.id, libraryItemId));
}

const itemFields = {
  id: classLibraryItems.id,
  classId: classLibraryItems.classId,
  className: classes.name,
  itemType: classLibraryItems.itemType,
  itemId: classLibraryItems.itemId,
  audience: classLibraryItems.audience,
  sharedAt: classLibraryItems.sharedAt,
  sharerId: user.id,
  sharerName: user.name,
  sharerColor: user.avatarColor,
  role: classMembers.role,
};
/** Items of the classes `viewerId` is in, joined to class and sharer, plus item-specific fields. */
function visibleItems(
  db: Db,
  viewerId: string,
  item: { title: AnyColumn | SQL; count: AnyColumn | SQL },
) {
  return db
    .select({
      ...itemFields,
      title: sql<string>`${item.title}`,
      count: sql<number>`${item.count}`,
    })
    .from(classLibraryItems)
    .innerJoin(
      classMembers,
      and(eq(classMembers.classId, classLibraryItems.classId), eq(classMembers.userId, viewerId)),
    )
    .innerJoin(classes, eq(classes.id, classLibraryItems.classId))
    .innerJoin(user, eq(user.id, classLibraryItems.sharedBy))
    .$dynamic();
}
type ItemRow = Awaited<ReturnType<ReturnType<typeof visibleItems>["execute"]>>[number];
/** Students see "whole class" shares only; teachers see everything shared into the class. */
const audienceVisible = or(
  eq(classLibraryItems.audience, "class"),
  inArray(classMembers.role, ["owner", "teacher"]),
);
/** Shared sets still live, not taken down, whose owner is in good standing. */
function setItems(db: Db, viewerId: string, where: SQL | undefined, limit: number) {
  return visibleItems(db, viewerId, { title: studySets.title, count: studySets.cardCount })
    .innerJoin(
      studySets,
      and(eq(classLibraryItems.itemType, "set"), eq(studySets.id, classLibraryItems.itemId)),
    )
    .where(
      and(
        where,
        audienceVisible,
        isNull(studySets.deletedAt),
        isNull(studySets.hiddenAt),
        ownerInGoodStanding(),
      ),
    )
    .orderBy(desc(classLibraryItems.sharedAt))
    .limit(limit);
}
/** Shared folders (owner in good standing) with how many visible sets they hold. */
function folderItems(db: Db, viewerId: string, where: SQL | undefined, limit: number) {
  const setCount = sql`(select count(*)::int from folder_sets fs
    inner join study_sets s on s.id = fs.set_id
    where fs.folder_id = ${folders.id} and s.deleted_at is null and s.hidden_at is null)`;
  return visibleItems(db, viewerId, { title: folders.name, count: setCount })
    .innerJoin(
      folders,
      and(eq(classLibraryItems.itemType, "folder"), eq(folders.id, classLibraryItems.itemId)),
    )
    .where(
      and(
        where,
        audienceVisible,
        sql`not exists(select 1 from "user" u where u.id = ${folders.userId}
          and (u.banned_at is not null or u.deleted_at is not null))`,
      ),
    )
    .orderBy(desc(classLibraryItems.sharedAt))
    .limit(limit);
}

function toItem(row: ItemRow, viewerId: string): MyClassLibraryItem {
  const isSet = row.itemType === "set";
  return {
    id: row.id,
    classId: row.classId,
    className: row.className,
    itemType: row.itemType,
    itemId: row.itemId,
    title: row.title,
    cardCount: isSet ? row.count : null,
    setCount: isSet ? null : row.count,
    audience: row.audience,
    sharedAt: row.sharedAt.toISOString(),
    sharedBy: { id: row.sharerId, name: row.sharerName, avatarColor: row.sharerColor },
    canRemove: row.sharerId === viewerId || canManageClass(row.role as ClassRole),
  };
}
async function libraryOf(db: Db, viewerId: string, where: SQL | undefined, limit: number) {
  const rows = [
    ...(await setItems(db, viewerId, where, limit)),
    ...(await folderItems(db, viewerId, where, limit)),
  ];
  return rows
    .toSorted((a, b) => b.sharedAt.getTime() - a.sharedAt.getTime())
    .slice(0, limit)
    .map((row) => toItem(row, viewerId));
}

/** A class's library as the viewer's role sees it: students only get "whole class" shares. */
export async function listClassLibrary(
  db: Database,
  userId: string,
  classId: string,
): Promise<ClassLibraryItem[]> {
  await requireMembership(db, userId, classId);
  const items = await libraryOf(
    db,
    userId,
    eq(classLibraryItems.classId, classId),
    MAX_LIBRARY_ITEMS_PER_CLASS,
  );
  return items.map(({ classId: _classId, className: _className, ...item }) => item);
}
/** "From class" in the library: what others shared into any of the person's classes. */
export async function myClassLibrary(db: Database, userId: string): Promise<MyClassLibraryItem[]> {
  return libraryOf(db, userId, ne(classLibraryItems.sharedBy, userId), MY_LIBRARY_LIMIT);
}

/** For the share dialog: every class of the owner and whether the item is shared there. */
export async function listItemShares(
  db: Database,
  userId: string,
  itemType: string,
  itemId: string,
) {
  const type = itemTypeSchema.parse(itemType);
  await requireOwnedItem(db, userId, type, itemId);
  const rows = await db
    .select({
      classId: classes.id,
      className: classes.name,
      myRole: classMembers.role,
      libraryItemId: classLibraryItems.id,
      audience: classLibraryItems.audience,
    })
    .from(classMembers)
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .leftJoin(
      classLibraryItems,
      and(
        eq(classLibraryItems.classId, classMembers.classId),
        eq(classLibraryItems.itemType, type),
        eq(classLibraryItems.itemId, itemId),
      ),
    )
    .where(eq(classMembers.userId, userId))
    .orderBy(classes.name);
  return rows;
}
