import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import { v7 } from "uuid";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/client";
import { requireStudySet } from "@/server/services/access";
import { createSetInTransaction, getSet, updateSet } from "@/server/services/sets";
import { putProgress } from "@/server/services/progress";

const url =
  process.env.TEST_DATABASE_URL ??
  "postgresql://siroquizz:siroquizz_local_only@localhost:5433/siroquizz_test";
if (!new URL(url).pathname.endsWith("_test")) throw new Error("Test DB required");
const connection = postgres(url, { max: 4 });
const db = drizzle(connection, { schema }) as Database;
const owner = v7(),
  learner = v7();

beforeAll(() => migrate(db, { migrationsFolder: "drizzle" }));
beforeEach(async () => {
  await db.execute(sql`truncate "user" cascade`);
  await db.insert(schema.user).values([
    { id: owner, name: "Owner", email: "lock-owner@example.com", emailVerified: true },
    { id: learner, name: "Learner", email: "lock-learner@example.com", emailVerified: true },
  ]);
});
afterAll(() => connection.end());

const makeSet = () =>
  db.transaction((tx) =>
    createSetInTransaction(tx, owner, {
      title: "Shared",
      description: "",
      termLang: "en",
      definitionLang: "vi",
      source: "manual",
      cards: [
        { term: "a", definition: "a" },
        { term: "b", definition: "b" },
      ],
    }),
  );
/** Opens a transaction holding the set lock until `release` is called. */
function holdLock(setId: string, userId: string) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let acquired!: () => void;
  const ready = new Promise<void>((resolve) => (acquired = resolve));
  const done = db.transaction(async (tx) => {
    await requireStudySet(tx, userId, setId, "share");
    acquired();
    await released;
  });
  return { ready, release, done };
}
const settledWithin = (promise: Promise<unknown>, ms: number) =>
  Promise.race([
    promise.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
  ]);

it("lets learners record progress on the same set concurrently", async () => {
  const set = await makeSet();
  await db.update(schema.studySets).set({ visibility: "unlisted" });
  const held = holdLock(set.id, owner);
  await held.ready;
  // Another learner's progress write does not queue behind the open review.
  const write = putProgress(db, learner, set.id, {
    cards: [{ cardId: set.cards[0].id, status: "known" }],
  });
  expect(await settledWithin(write, 2000)).toBe(true);
  held.release();
  await held.done;
});

it("makes an owner's edit wait for a review in progress", async () => {
  const set = await makeSet();
  const held = holdLock(set.id, owner);
  await held.ready;
  const edit = updateSet(db, owner, set.id, {
    ...set,
    title: "Edited",
    cards: set.cards,
  });
  expect(await settledWithin(edit, 300)).toBe(false);
  held.release();
  await held.done;
  await edit;
  expect((await getSet(db, owner, set.id)).title).toBe("Edited");
});
