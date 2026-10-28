import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import { v7 } from "uuid";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/client";
import { createSetInTransaction, removeSet } from "@/server/services/sets";
import { putProgress } from "@/server/services/progress";

const url =
  process.env.TEST_DATABASE_URL ??
  "postgresql://siroquizz:siroquizz_local_only@localhost:5433/siroquizz_test";
if (!new URL(url).pathname.endsWith("_test")) throw new Error("Test DB required");
const connection = postgres(url, { max: 1 });
const db = drizzle(connection, { schema }) as Database;
const owner = v7();

beforeAll(() => migrate(db, { migrationsFolder: "drizzle" }));
beforeEach(async () => {
  await db.execute(sql`truncate "user" cascade`);
  await db
    .insert(schema.user)
    .values({ id: owner, name: "Owner", email: "idx@example.com", emailVerified: true });
});
afterAll(() => connection.end());

/** The lookups foreign-key cascades run when a card or a set is deleted. */
const cascadeLookups = [
  ["card_progress", "card_id", "progress_card_idx"],
  ["card_progress", "set_id", "progress_set_idx"],
  ["card_stars", "card_id", "card_stars_card_idx"],
  ["review_logs", "card_id", "review_card_idx"],
  ["review_logs", "set_id", "review_set_idx"],
  ["test_results", "set_id", "tests_set_idx"],
  ["study_activity", "set_id", "activity_set_idx"],
] as const;

it("serves every cascade lookup from an index", async () => {
  for (const [table, column, index] of cascadeLookups) {
    const plan = await db.transaction(async (tx) => {
      // Tiny test tables favour sequential scans; disabling them shows the index is usable.
      await tx.execute(sql`set local enable_seqscan = off`);
      return tx.execute(sql.raw(`explain delete from ${table} where ${column} = '${v7()}'::uuid`));
    });
    expect(JSON.stringify(plan)).toContain(index);
  }
});

it("drops the duplicate cards(set_id) index and keeps the position constraint", async () => {
  const rows = await db.execute<{ indexname: string }>(
    sql`select indexname from pg_indexes where tablename = 'cards'`,
  );
  const names = rows.map((row) => row.indexname);
  expect(names).not.toContain("cards_set_idx");
  expect(names).toContain("cards_set_position_unique");
});

it("deletes a 500-card set with progress", async () => {
  const set = await db.transaction((tx) =>
    createSetInTransaction(tx, owner, {
      title: "Big",
      description: "",
      termLang: "en",
      definitionLang: "vi",
      source: "manual",
      cards: Array.from({ length: 500 }, (_, i) => ({ term: `t${i}`, definition: `d${i}` })),
    }),
  );
  await putProgress(db, owner, set.id, {
    cards: set.cards.map((card) => ({ cardId: card.id, status: "new" })),
  });
  await removeSet(db, owner, set.id);
  const [{ count }] = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from card_progress where set_id = ${set.id}`,
  );
  expect(count).toBe(0);
});
