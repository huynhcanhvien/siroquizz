import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq, sql } from "drizzle-orm";
import { v7 } from "uuid";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/client";
import { getSet, removeSet, updateSet } from "@/server/services/sets";
import { dueCards } from "@/server/services/learning";
import { leaveClass, removeMember, deleteClass } from "@/server/services/classes";
import {
  addSetToFolder,
  createFolder,
  deleteFolder,
  folderStudySet,
  getFolder,
  removeSetFromFolder,
} from "@/server/services/folders";
import {
  listClassLibrary,
  listItemShares,
  myClassLibrary,
  shareToClass,
  unshareFromClass,
} from "@/server/services/class-library";
import { grantCollaborator, revokeCollaborator } from "@/server/services/collaborators";
import { insertCast, makeClass, makeSet, newCast } from "./helpers/collab";

vi.mock("@/server/rate-limit", () => ({ enforceLimit: vi.fn() }));
const url =
  process.env.TEST_DATABASE_URL ??
  "postgresql://siroquizz:siroquizz_local_only@localhost:5433/siroquizz_test";
if (!new URL(url).pathname.endsWith("_test")) throw new Error("Test DB required");
const connection = postgres(url, { max: 3 }),
  db = drizzle(connection, { schema }) as Database,
  cast = newCast();
const { an, mai, binh, bao, outsider } = cast;

beforeAll(() => migrate(db, { migrationsFolder: "drizzle" }));
beforeEach(async () => {
  await db.execute(sql`truncate "user" cascade`);
  await insertCast(db, cast);
});
afterAll(() => connection.end());

const edit = (set: Awaited<ReturnType<typeof makeSet>>, title: string) => ({
  ...set,
  title,
  cards: set.cards,
});
async function sharedSet(audience: "class" | "teachers" = "class") {
  const klass = await makeClass(db, cast);
  const set = await makeSet(db, an);
  await shareToClass(db, an, klass.id, { itemType: "set", itemId: set.id, audience });
  return { klass, set };
}

describe("access through the class library", () => {
  it("A1: the owner reads and edits with full access", async () => {
    const set = await makeSet(db, an);
    const read = await getSet(db, an, set.id);
    expect(read.access).toEqual({
      isOwner: true,
      canEdit: true,
      acceptsContributions: true,
      pendingChangeRequests: 0,
    });
    expect((await updateSet(db, an, set.id, edit(set, "Mine"))).title).toBe("Mine");
  });

  it("A2/A9: a named collaborator edits until revoked", async () => {
    const { klass, set } = await sharedSet();
    expect(klass.id).toBeTruthy();
    await grantCollaborator(db, an, set.id, { principalType: "user", principalId: bao });
    const read = await getSet(db, bao, set.id);
    expect(read.access).toMatchObject({ isOwner: false, canEdit: true });
    expect((await updateSet(db, bao, set.id, edit(set, "By Bảo"))).title).toBe("By Bảo");
    await revokeCollaborator(db, an, set.id, "user", bao);
    await expect(updateSet(db, bao, set.id, edit(set, "Again"))).rejects.toMatchObject({
      status: 403,
    });
  });

  it("A3: granting a class's teachers covers every teacher but not students", async () => {
    const { klass, set } = await sharedSet();
    await grantCollaborator(db, an, set.id, {
      principalType: "class_teachers",
      principalId: klass.id,
    });
    await updateSet(db, mai, set.id, edit(set, "By Mai"));
    await updateSet(db, binh, set.id, edit(set, "By Bình"));
    await expect(updateSet(db, bao, set.id, edit(set, "By Bảo"))).rejects.toMatchObject({
      status: 403,
    });
  });

  it("A4: a classmate studies a set shared with the class but cannot edit it", async () => {
    const { set } = await sharedSet();
    const read = await getSet(db, bao, set.id);
    expect(read.sharing).toBeUndefined();
    expect(read.access).toMatchObject({
      isOwner: false,
      canEdit: false,
      sharedIn: { className: "Lớp 10A", sharedByName: "An", audience: "class" },
    });
    await expect(updateSet(db, bao, set.id, edit(set, "x"))).rejects.toMatchObject({ status: 403 });
  });

  it("A5/A14: a folder shared with the class opens its sets until a set leaves the folder", async () => {
    const klass = await makeClass(db, cast);
    const set = await makeSet(db, an);
    const folder = await createFolder(db, an, { name: "Unit 1" });
    await addSetToFolder(db, an, folder.id, set.id);
    await shareToClass(db, an, klass.id, { itemType: "folder", itemId: folder.id });
    expect((await getSet(db, bao, set.id)).cards).toHaveLength(4);
    const opened = await getFolder(db, bao, folder.id);
    expect(opened).toMatchObject({ isOwner: false, sets: [{ id: set.id }] });
    expect((await folderStudySet(db, bao, folder.id)).cards).toHaveLength(4);
    const due = await dueCards(db, bao, 200, new Date(), false, folder.id);
    expect(due.cards).toHaveLength(4);
    // Outside the folder, an unstudied shared set adds no new cards to the general queue.
    expect((await dueCards(db, bao)).cards).toHaveLength(0);
    await removeSetFromFolder(db, an, folder.id, set.id);
    await expect(getSet(db, bao, set.id)).rejects.toMatchObject({ status: 404 });
  });

  it("A6: a teachers-only share hides the set from students until re-shared to the class", async () => {
    const { klass, set } = await sharedSet("teachers");
    expect((await getSet(db, mai, set.id)).title).toBe(set.title);
    await expect(getSet(db, bao, set.id)).rejects.toMatchObject({ status: 404 });
    await shareToClass(db, an, klass.id, { itemType: "set", itemId: set.id, audience: "class" });
    expect((await getSet(db, bao, set.id)).id).toBe(set.id);
  });

  it("A7: outsiders see nothing", async () => {
    const { klass, set } = await sharedSet();
    await expect(getSet(db, outsider, set.id)).rejects.toMatchObject({ status: 404 });
    await expect(updateSet(db, outsider, set.id, edit(set, "x"))).rejects.toMatchObject({
      status: 404,
    });
    await expect(listClassLibrary(db, outsider, klass.id)).rejects.toMatchObject({ status: 404 });
  });

  it("A8: leaving a class removes what one shared and what one could see", async () => {
    const { klass, set } = await sharedSet();
    const other = await makeSet(db, bao, "Bảo's words");
    await shareToClass(db, bao, klass.id, { itemType: "set", itemId: other.id });
    await grantCollaborator(db, an, set.id, {
      principalType: "class_teachers",
      principalId: klass.id,
    });
    await leaveClass(db, bao, klass.id);
    expect((await listClassLibrary(db, mai, klass.id)).map((item) => item.itemId)).toEqual([
      set.id,
    ]);
    await expect(getSet(db, bao, set.id)).rejects.toMatchObject({ status: 404 });
    await leaveClass(db, binh, klass.id);
    await expect(updateSet(db, binh, set.id, edit(set, "x"))).rejects.toMatchObject({
      status: 404,
    });
  });

  it("A10: a set hidden by a moderator disappears for viewers and collaborators", async () => {
    const { set } = await sharedSet();
    await grantCollaborator(db, an, set.id, { principalType: "user", principalId: bao });
    await db
      .update(schema.studySets)
      .set({ hiddenAt: new Date() })
      .where(eq(schema.studySets.id, set.id));
    await expect(getSet(db, mai, set.id)).rejects.toMatchObject({ status: 404 });
    await expect(updateSet(db, bao, set.id, edit(set, "x"))).rejects.toMatchObject({
      status: 404,
    });
    expect((await getSet(db, an, set.id)).id).toBe(set.id);
  });

  it("A11: a banned owner's shares vanish from the class", async () => {
    const { klass, set } = await sharedSet();
    await db.update(schema.user).set({ bannedAt: new Date() }).where(eq(schema.user.id, an));
    await expect(getSet(db, mai, set.id)).rejects.toMatchObject({ status: 404 });
    expect(await listClassLibrary(db, mai, klass.id)).toEqual([]);
  });

  it("A12: a stale base timestamp is a conflict; no base saves as before", async () => {
    const set = await makeSet(db, an);
    await updateSet(db, an, set.id, edit(set, "First"));
    await expect(
      updateSet(db, an, set.id, { ...edit(set, "Second"), baseUpdatedAt: set.updatedAt }),
    ).rejects.toMatchObject({ status: 409, code: "SET_CHANGED" });
    const fresh = await getSet(db, an, set.id);
    expect(
      (await updateSet(db, an, set.id, { ...edit(set, "Third"), baseUpdatedAt: fresh.updatedAt }))
        .title,
    ).toBe("Third");
    expect((await updateSet(db, an, set.id, edit(set, "Fourth"))).title).toBe("Fourth");
  });
});

describe("class library", () => {
  it("L1: only members share their own items; teachers or the sharer remove them", async () => {
    const klass = await makeClass(db, cast);
    const set = await makeSet(db, an);
    await expect(
      shareToClass(db, bao, klass.id, { itemType: "set", itemId: set.id }),
    ).rejects.toMatchObject({ status: 404 });
    const mine = await makeSet(db, outsider);
    await expect(
      shareToClass(db, outsider, klass.id, { itemType: "set", itemId: mine.id }),
    ).rejects.toMatchObject({ status: 404 });
    const { id } = await shareToClass(db, an, klass.id, { itemType: "set", itemId: set.id });
    await expect(unshareFromClass(db, bao, klass.id, id)).rejects.toMatchObject({ status: 403 });
    await unshareFromClass(db, binh, klass.id, id);
    expect(await listClassLibrary(db, mai, klass.id)).toEqual([]);
    const again = await shareToClass(db, an, klass.id, { itemType: "set", itemId: set.id });
    await unshareFromClass(db, an, klass.id, again.id);
  });

  it("L1: a class library holds at most 500 items", async () => {
    const klass = await makeClass(db, cast);
    const set = await makeSet(db, an);
    await db.insert(schema.classLibraryItems).values(
      Array.from({ length: 500 }, () => ({
        id: v7(),
        classId: klass.id,
        itemType: "set" as const,
        itemId: v7(),
        sharedBy: an,
      })),
    );
    await expect(
      shareToClass(db, an, klass.id, { itemType: "set", itemId: set.id }),
    ).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
  });

  it("L2: lists by role, across classes, without deleted items", async () => {
    const klass = await makeClass(db, cast);
    const second = await makeClass(db, cast, "Lớp 11B");
    const set = await makeSet(db, an);
    const secret = await makeSet(db, an, "For teachers");
    const gone = await makeSet(db, an, "Deleted");
    const folder = await createFolder(db, an, { name: "Unit 2" });
    await addSetToFolder(db, an, folder.id, set.id);
    await shareToClass(db, an, klass.id, { itemType: "set", itemId: set.id });
    await shareToClass(db, an, klass.id, {
      itemType: "set",
      itemId: secret.id,
      audience: "teachers",
    });
    await shareToClass(db, an, klass.id, { itemType: "set", itemId: gone.id });
    await shareToClass(db, an, second.id, { itemType: "folder", itemId: folder.id });
    await removeSet(db, an, gone.id);
    const forTeacher = await listClassLibrary(db, mai, klass.id);
    expect(forTeacher.map((item) => item.title).toSorted()).toEqual(["An's words", "For teachers"]);
    expect(forTeacher.every((item) => item.canRemove)).toBe(true);
    const forStudent = await listClassLibrary(db, bao, klass.id);
    expect(forStudent).toEqual([
      expect.objectContaining({
        itemType: "set",
        title: "An's words",
        cardCount: 4,
        setCount: null,
        audience: "class",
        sharedBy: expect.objectContaining({ id: an, name: "An" }),
        canRemove: false,
      }),
    ]);
    const mine = await myClassLibrary(db, bao);
    expect(mine.map((item) => [item.className, item.title]).toSorted()).toEqual([
      ["Lớp 10A", "An's words"],
      ["Lớp 11B", "Unit 2"],
    ]);
    expect(mine.find((item) => item.itemType === "folder")).toMatchObject({ setCount: 1 });
    const shares = await listItemShares(db, an, "set", set.id);
    expect(shares.map((share) => [share.className, share.audience])).toEqual(
      expect.arrayContaining([
        ["Lớp 10A", "class"],
        ["Lớp 11B", null],
      ]),
    );
    await expect(listItemShares(db, bao, "set", set.id)).rejects.toMatchObject({ status: 404 });
    await deleteFolder(db, an, folder.id);
    expect(await listClassLibrary(db, mai, second.id)).toEqual([]);
  });

  it("removing a member or deleting the class cleans up shares and teacher grants", async () => {
    const { klass, set } = await sharedSet();
    const other = await makeSet(db, bao, "Bảo's words");
    await shareToClass(db, bao, klass.id, { itemType: "set", itemId: other.id });
    await removeMember(db, mai, klass.id, bao);
    expect((await listClassLibrary(db, mai, klass.id)).map((item) => item.itemId)).toEqual([
      set.id,
    ]);
    await grantCollaborator(db, an, set.id, {
      principalType: "class_teachers",
      principalId: klass.id,
    });
    await deleteClass(db, mai, klass.id);
    const grants = await db.select().from(schema.setCollaborators);
    expect(grants).toEqual([]);
  });
});
