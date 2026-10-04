import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq, sql } from "drizzle-orm";
import { v7 } from "uuid";
import * as schema from "@/server/db/schema";
import {
  createSetInTransaction,
  getSet,
  listSets,
  removeSet,
  updateSet,
} from "@/server/services/sets";
import {
  correctTest,
  getProgress,
  putProgress,
  saveGame,
  saveTest,
} from "@/server/services/progress";
import { importLocal } from "@/server/services/import-local";
import type { Database } from "@/server/db/client";

const testUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://siroquizz:siroquizz_local_only@localhost:5433/siroquizz_test";
if (!new URL(testUrl).pathname.endsWith("_test"))
  throw new Error("Integration database name must end in _test");
const connection = postgres(testUrl, { max: 1 });
const db = drizzle(connection, { schema }) as Database;
const a = v7(),
  b = v7();
const input = {
  title: "HSK",
  description: "",
  termLang: "zh",
  definitionLang: "vi",
  source: "manual",
  cards: [
    { term: "你好", definition: "xin chào" },
    { term: "谢谢", definition: "cảm ơn" },
  ],
};
const create = (owner = a) => db.transaction((tx) => createSetInTransaction(tx, owner, input));

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
});
beforeEach(async () => {
  await db.execute(sql`truncate "user" cascade`);
  await db.insert(schema.user).values([
    { id: a, name: "A", email: "a@example.com", emailVerified: true },
    { id: b, name: "B", email: "b@example.com", emailVerified: true },
  ]);
});
afterAll(async () => {
  await connection.end();
});

describe("Postgres ownership and transactional updates", () => {
  it("denies another user's reads, writes, deletes, progress, scores and corrections", async () => {
    const set = await create();
    await expect(getSet(db, b, set.id)).rejects.toMatchObject({ status: 404 });
    await expect(updateSet(db, b, set.id, input)).rejects.toMatchObject({ status: 404 });
    await expect(removeSet(db, b, set.id)).rejects.toMatchObject({ status: 404 });
    await expect(getProgress(db, b, set.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      putProgress(db, b, set.id, { cards: [{ cardId: set.cards[0].id, status: "known" }] }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      saveGame(db, b, set.id, { setId: set.id, game: "match", score: 1, timeMs: 100 }),
    ).rejects.toMatchObject({ status: 404 });
    const result = await saveTest(db, a, set.id, {
      setId: set.id,
      score: 1,
      total: 2,
      durationMs: 100,
    });
    await expect(correctTest(db, b, result.id, { score: 2 })).rejects.toMatchObject({
      status: 404,
    });
  });
  it("retains IDs/progress on reorder and removes progress only for removed cards", async () => {
    const set = await create();
    await putProgress(db, a, set.id, { cards: [{ cardId: set.cards[0].id, status: "known" }] });
    const updated = await updateSet(db, a, set.id, { ...input, cards: set.cards.toReversed() });
    expect(updated.cards.map((c) => c.id)).toEqual(set.cards.map((c) => c.id).toReversed());
    expect(await getProgress(db, a, set.id)).toHaveLength(1);
    await updateSet(db, a, set.id, {
      ...input,
      cards: [set.cards[1], { term: "再见", definition: "tạm biệt" }],
    });
    expect(await getProgress(db, a, set.id)).toHaveLength(0);
  });
  it("does not accept a card belonging to a different set", async () => {
    const set = await create(),
      other = await create();
    await expect(
      putProgress(db, a, set.id, { cards: [{ cardId: other.cards[0].id, status: "known" }] }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("rolls back edits with duplicated IDs", async () => {
    const set = await create();
    await expect(
      updateSet(db, a, set.id, { ...input, title: "changed", cards: [set.cards[0], set.cards[0]] }),
    ).rejects.toMatchObject({ status: 400 });
    expect((await getSet(db, a, set.id)).title).toBe("HSK");
  });
  it("does not reuse client-supplied foreign IDs on create or edit", async () => {
    const first = await create(),
      second = await create();
    const changed = await updateSet(db, a, second.id, { ...input, cards: first.cards });
    expect(changed.cards[0].id).not.toBe(first.cards[0].id);
  });
  it("paginates with equal timestamps without duplicating or losing sets", async () => {
    const sets = await Promise.all([create(), create(), create()]);
    const at = new Date("2026-10-04T00:00:00Z");
    for (const s of sets)
      await db.update(schema.studySets).set({ updatedAt: at }).where(eq(schema.studySets.id, s.id));
    const page1 = await listSets(db, a, new URLSearchParams({ limit: "2" }));
    const page2 = await listSets(
      db,
      a,
      new URLSearchParams({ limit: "2", cursor: page1.meta.nextCursor! }),
    );
    expect(new Set([...page1.data, ...page2.data].map((s) => s.id)).size).toBe(3);
    expect(page2.meta.nextCursor).toBeNull();
  });
  it("paginates each sort and rejects cursors for another order", async () => {
    for (const [title, count] of [
      ["Zebra", 2],
      ["Alpha", 3],
      ["Middle", 4],
    ] as const)
      await db.transaction((tx) =>
        createSetInTransaction(tx, a, {
          ...input,
          title,
          cards: Array.from({ length: count }, (_, i) => ({
            term: `term${i}`,
            definition: `definition${i}`,
          })),
        }),
      );
    for (const [sort, expected] of [
      ["name", ["Alpha", "Middle", "Zebra"]],
      ["cards", ["Middle", "Alpha", "Zebra"]],
    ] as const) {
      const first = await listSets(db, a, new URLSearchParams({ sort, limit: "2" }));
      const second = await listSets(
        db,
        a,
        new URLSearchParams({ sort, limit: "2", cursor: first.meta.nextCursor! }),
      );
      expect([...first.data, ...second.data].map((s) => s.title)).toEqual(expected);
      await expect(
        listSets(db, a, new URLSearchParams({ sort: "recent", cursor: first.meta.nextCursor! })),
      ).rejects.toMatchObject({ status: 400 });
    }
  });
  it("lists ordered cards with the same data as detail reads and excludes other owners", async () => {
    const first = await create();
    const second = await create();
    await create(b);
    await updateSet(db, a, first.id, {
      ...input,
      title: "Reordered",
      cards: first.cards.toReversed().map((card) => ({ ...card, phonetic: "test" })),
    });
    const page = await listSets(db, a, new URLSearchParams());
    expect(page.data).toHaveLength(2);
    for (const set of page.data) expect(set).toEqual(await getSet(db, a, set.id));
    expect(page.data.map((set) => set.id)).toContain(second.id);
    const empty = await listSets(db, a, new URLSearchParams({ q: "missing" }));
    expect(empty.data).toEqual([]);
    expect(empty.meta.nextCursor).toBeNull();
  });
  it("soft-deleted sets become unreadable and progress is cascaded", async () => {
    const set = await create();
    await putProgress(db, a, set.id, { cards: [{ cardId: set.cards[0].id, status: "known" }] });
    await removeSet(db, a, set.id);
    await expect(getSet(db, a, set.id)).rejects.toMatchObject({ status: 404 });
    expect(await db.select().from(schema.cardProgress)).toHaveLength(0);
  });
  it("rejects invalid test totals and correction bounds", async () => {
    const set = await create();
    await expect(
      saveTest(db, a, set.id, { setId: set.id, score: 3, total: 2, durationMs: 0 }),
    ).rejects.toThrow();
    const result = await saveTest(db, a, set.id, {
      setId: set.id,
      score: 1,
      total: 2,
      durationMs: 0,
    });
    await expect(correctTest(db, a, result.id, { score: 3 })).rejects.toMatchObject({
      status: 400,
    });
  });
  it("imports data with new owner/card IDs, preserves progress and is idempotent", async () => {
    const local = {
      ...input,
      id: "local-set",
      cards: input.cards.map((c, i) => ({ ...c, id: `local-card-${i}` })),
    };
    const payload = {
      sets: [local],
      progress: [
        {
          userId: "old-user",
          setId: "local-set",
          cardId: "local-card-0",
          status: "known",
          updatedAt: new Date().toISOString(),
        },
      ],
    };
    expect((await importLocal(db, a, payload)).imported).toEqual(["local-set"]);
    await importLocal(db, a, payload);
    const sets = (await listSets(db, a, new URLSearchParams())).data;
    expect(sets).toHaveLength(1);
    expect(sets[0].ownerId).toBe(a);
    expect((await getProgress(db, a, sets[0].id))[0]).toMatchObject({
      userId: a,
      cardId: sets[0].cards[0].id,
      status: "known",
    });
  });
});
