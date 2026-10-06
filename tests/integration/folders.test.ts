import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import { v7 } from "uuid";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/client";
import { createSetInTransaction, removeSet } from "@/server/services/sets";
import {
  addSetToFolder,
  createFolder,
  deleteFolder,
  folderStudySet,
  foldersOfSet,
  getFolder,
  listFolders,
  removeSetFromFolder,
  renameFolder,
} from "@/server/services/folders";
import { dueCards, reviewCard } from "@/server/services/learning";

const url =
  process.env.TEST_DATABASE_URL ??
  "postgresql://siroquizz:siroquizz_local_only@localhost:5433/siroquizz_test";
if (!new URL(url).pathname.endsWith("_test")) throw new Error("Test DB required");
const connection = postgres(url, { max: 3 }),
  db = drizzle(connection, { schema }) as Database,
  me = v7(),
  other = v7();
const makeSet = (title: string, owner = me, count = 3) =>
  db.transaction((tx) =>
    createSetInTransaction(tx, owner, {
      title,
      description: "",
      termLang: "en",
      definitionLang: "vi",
      source: "manual",
      cards: Array.from({ length: count }, (_, i) => ({
        term: `${title} ${i}`,
        definition: `d ${i}`,
      })),
    }),
  );

beforeAll(() => migrate(db, { migrationsFolder: "drizzle" }));
beforeEach(async () => {
  await db.execute(sql`truncate "user" cascade`);
  await db.insert(schema.user).values([
    { id: me, name: "Me", email: "f-me@example.com", emailVerified: true },
    { id: other, name: "Other", email: "f-other@example.com", emailVerified: true },
  ]);
});
afterAll(() => connection.end());

it("creates, renames, lists and deletes folders without touching their sets", async () => {
  const folder = await createFolder(db, me, { name: "  HSK  " });
  expect(folder).toMatchObject({ name: "HSK", setCount: 0 });
  await expect(createFolder(db, me, { name: "" })).rejects.toBeTruthy();
  const set = await makeSet("Animals");
  await addSetToFolder(db, me, folder.id, set.id);
  await addSetToFolder(db, me, folder.id, set.id);
  await renameFolder(db, me, folder.id, { name: "HSK 2" });
  expect(await listFolders(db, me)).toEqual([
    expect.objectContaining({ id: folder.id, name: "HSK 2", setCount: 1 }),
  ]);
  expect(await foldersOfSet(db, me, set.id)).toEqual([folder.id]);
  await deleteFolder(db, me, folder.id);
  expect(await listFolders(db, me)).toEqual([]);
  const [stillThere] = await db
    .select()
    .from(schema.studySets)
    .where(sql`id = ${set.id}`);
  expect(stillThere.deletedAt).toBeNull();
});

it("keeps folders private and holds only the owner's sets", async () => {
  const folder = await createFolder(db, me, { name: "Mine" });
  const theirs = await makeSet("Theirs", other);
  await expect(addSetToFolder(db, me, folder.id, theirs.id)).rejects.toMatchObject({ status: 404 });
  const mine = await makeSet("Mine");
  await expect(addSetToFolder(db, other, folder.id, mine.id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(getFolder(db, other, folder.id)).rejects.toMatchObject({ status: 404 });
  await expect(renameFolder(db, other, folder.id, { name: "x" })).rejects.toMatchObject({
    status: 404,
  });
  await expect(deleteFolder(db, other, folder.id)).rejects.toMatchObject({ status: 404 });
  await expect(folderStudySet(db, other, folder.id)).rejects.toMatchObject({ status: 404 });
  expect(await listFolders(db, other)).toEqual([]);
});

it("merges a folder's cards in folder order and drops deleted sets", async () => {
  const folder = await createFolder(db, me, { name: "Mixed" });
  const first = await makeSet("First", me, 2);
  const second = await makeSet("Second", me, 3);
  const gone = await makeSet("Gone", me, 2);
  for (const set of [second, first, gone]) await addSetToFolder(db, me, folder.id, set.id);
  await removeSet(db, me, gone.id);
  expect((await getFolder(db, me, folder.id)).sets.map((set) => set.title)).toEqual([
    "Second",
    "First",
  ]);
  const study = await folderStudySet(db, me, folder.id);
  expect(study).toMatchObject({ id: folder.id, title: "Mixed", termLang: "en" });
  expect(study.cards.map((card) => card.term)).toEqual([
    "Second 0",
    "Second 1",
    "Second 2",
    "First 0",
    "First 1",
  ]);
  await removeSetFromFolder(db, me, folder.id, second.id);
  expect((await folderStudySet(db, me, folder.id)).cards).toHaveLength(2);
  await removeSetFromFolder(db, me, folder.id, first.id);
  await expect(folderStudySet(db, me, folder.id)).rejects.toMatchObject({ status: 404 });
});

it("narrows the review queue to a folder", async () => {
  const folder = await createFolder(db, me, { name: "Due" });
  const inside = await makeSet("Inside", me, 2);
  const outside = await makeSet("Outside", me, 2);
  await addSetToFolder(db, me, folder.id, inside.id);
  // Review every card once, then look at the queue two days later when all are due again.
  for (const card of [...inside.cards, ...outside.cards])
    await reviewCard(db, me, {
      eventId: v7(),
      cardId: card.id,
      rating: 1,
      mode: "review",
      durationMs: 1000,
    });
  const later = new Date(Date.now() + 2 * 86400_000);
  const all = await dueCards(db, me, 200, later);
  const scoped = await dueCards(db, me, 200, later, false, folder.id);
  const setsOf = (result: Awaited<ReturnType<typeof dueCards>>) =>
    new Set(result.cards.map((card) => card.setId));
  expect(setsOf(all)).toEqual(new Set([inside.id, outside.id]));
  expect(setsOf(scoped)).toEqual(new Set([inside.id]));
  // Another person's folder id narrows to nothing of theirs.
  const foreign = await createFolder(db, other, { name: "Theirs" });
  expect((await dueCards(db, me, 200, later, false, foreign.id)).cards).toEqual([]);
});
