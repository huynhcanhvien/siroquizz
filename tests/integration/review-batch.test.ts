import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { and, eq, sql } from "drizzle-orm";
import { v7 } from "uuid";
import type { Card as FsrsCard } from "ts-fsrs";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/client";
import { scheduleReview } from "@/features/srs/lib/scheduler";
import { createSetInTransaction } from "@/server/services/sets";
import { getPreferences, reviewBatchInTransaction, reviewCard } from "@/server/services/learning";
import { putProgress } from "@/server/services/progress";

const url =
  process.env.TEST_DATABASE_URL ??
  "postgresql://siroquizz:siroquizz_local_only@localhost:5433/siroquizz_test";
if (!new URL(url).pathname.endsWith("_test")) throw new Error("Test DB required");
const connection = postgres(url, { max: 1 });
const db = drizzle(connection, { schema }) as Database;
const queries = { count: 0 };
// Same connection, but every statement is counted.
const countedDb = drizzle(connection, {
  schema,
  logger: { logQuery: () => void queries.count++ },
}) as Database;
const learner = v7();

beforeAll(() => migrate(db, { migrationsFolder: "drizzle" }));
beforeEach(async () => {
  await db.execute(sql`truncate "user" cascade`);
  await db
    .insert(schema.user)
    .values({ id: learner, name: "Learner", email: "batch@example.com", emailVerified: true });
});
afterAll(() => connection.end());

const makeSet = (size: number) =>
  db.transaction((tx) =>
    createSetInTransaction(tx, learner, {
      title: `Deck ${size}`,
      description: "",
      termLang: "en",
      definitionLang: "vi",
      source: "manual",
      cards: Array.from({ length: size }, (_, i) => ({ term: `t${i}`, definition: `d${i}` })),
    }),
  );
const progressOf = (setId: string) =>
  db
    .select()
    .from(schema.cardProgress)
    .where(and(eq(schema.cardProgress.userId, learner), eq(schema.cardProgress.setId, setId)));
const toFsrs = (row: {
  due: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: string | null;
}): FsrsCard => ({
  due: new Date(row.due),
  stability: row.stability,
  difficulty: row.difficulty,
  elapsed_days: row.elapsedDays,
  scheduled_days: row.scheduledDays,
  learning_steps: row.learningSteps,
  reps: row.reps,
  lapses: row.lapses,
  state: row.state,
  last_review: row.lastReview ? new Date(row.lastReview) : undefined,
});

it("records 500 swipes in at most 10 queries", async () => {
  const set = await makeSet(500);
  await getPreferences(db, learner);
  // Every card was studied before, so the new-card allowance does not apply.
  await db.insert(schema.cardProgress).values(
    set.cards.map((card) => ({
      userId: learner,
      cardId: card.id,
      setId: set.id,
      status: "learning" as const,
      reps: 1,
    })),
  );
  queries.count = 0;
  const rows = await putProgress(countedDb, learner, set.id, {
    cards: set.cards.map((card) => ({ cardId: card.id, status: "known" })),
  });
  expect(queries.count).toBeLessThanOrEqual(10);
  expect(rows).toHaveLength(500);
  expect(rows.map((row) => row.cardId)).toEqual(set.cards.map((card) => card.id));
  expect((await progressOf(set.id)).every((row) => row.status === "known")).toBe(true);
  const [{ count }] = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from review_logs where set_id = ${set.id}`,
  );
  expect(count).toBe(500);
});

it("schedules each card in a batch exactly like a single FSRS review", async () => {
  const set = await makeSet(3);
  const first = new Date("2026-10-01T08:00:00Z"),
    second = new Date("2026-10-03T08:00:00Z");
  const [a, b, c] = set.cards;
  const snapshots = await db.transaction((tx) =>
    reviewBatchInTransaction(
      tx,
      learner,
      [
        { eventId: v7(), cardId: b.id, rating: 3, mode: "flashcards", durationMs: 0 },
        { eventId: v7(), cardId: c.id, rating: 1, mode: "flashcards", durationMs: 0 },
        { eventId: v7(), cardId: a.id, rating: 3, mode: "review", durationMs: 1000 },
      ],
      first,
    ),
  );
  const expectedB = scheduleReview(null, 3, first, 0.9),
    expectedC = scheduleReview(null, 1, first, 0.9);
  expect(snapshots[0]).toMatchObject({
    cardId: b.id,
    status: "known",
    due: expectedB.due.toISOString(),
    stability: expectedB.stability,
    difficulty: expectedB.difficulty,
    reps: expectedB.reps,
    state: expectedB.state,
  });
  expect(snapshots[1]).toMatchObject({
    cardId: c.id,
    status: "learning",
    due: expectedC.due.toISOString(),
    reps: expectedC.reps,
  });
  // A card reviewed before continues from its stored state.
  const [again] = await db.transaction((tx) =>
    reviewBatchInTransaction(
      tx,
      learner,
      [{ eventId: v7(), cardId: a.id, rating: 4, mode: "review", durationMs: 0 }],
      second,
    ),
  );
  const expectedA = scheduleReview(toFsrs(snapshots[2]), 4, second, 0.9);
  expect(again).toMatchObject({
    due: expectedA.due.toISOString(),
    stability: expectedA.stability,
    reps: expectedA.reps,
  });
});

it("rejects a batch that exceeds today's new-card allowance and writes nothing", async () => {
  const set = await makeSet(21);
  await expect(
    putProgress(db, learner, set.id, {
      cards: set.cards.map((card) => ({ cardId: card.id, status: "known" })),
    }),
  ).rejects.toMatchObject({ status: 429, code: "NEW_CARD_LIMIT" });
  expect(await progressOf(set.id)).toHaveLength(0);
  const twenty = await putProgress(db, learner, set.id, {
    cards: set.cards.slice(0, 20).map((card) => ({ cardId: card.id, status: "known" })),
  });
  expect(twenty).toHaveLength(20);
});

it("replays a repeated event and refuses another learner's event or a foreign card", async () => {
  const set = await makeSet(2);
  const event = {
    eventId: v7(),
    cardId: set.cards[0].id,
    rating: 3,
    mode: "review",
    durationMs: 0,
  };
  const saved = await reviewCard(db, learner, event);
  expect(await reviewCard(db, learner, event)).toEqual(saved);
  await expect(
    reviewCard(db, learner, { ...event, cardId: set.cards[1].id }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    reviewCard(db, learner, { ...event, eventId: v7(), cardId: v7() }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    db.transaction((tx) =>
      reviewBatchInTransaction(tx, learner, [
        { ...event, eventId: v7() },
        { ...event, eventId: v7() },
      ]),
    ),
  ).rejects.toMatchObject({ status: 400 });
});

it("mixes resets and reviews in one progress write, in the order sent", async () => {
  const set = await makeSet(3);
  const rows = await putProgress(db, learner, set.id, {
    cards: [
      { cardId: set.cards[0].id, status: "new" },
      { cardId: set.cards[1].id, status: "learning" },
      { cardId: set.cards[2].id, status: "known" },
    ],
  });
  expect(rows.map((row) => [row.cardId, row.status])).toEqual([
    [set.cards[0].id, "new"],
    [set.cards[1].id, "learning"],
    [set.cards[2].id, "known"],
  ]);
});
