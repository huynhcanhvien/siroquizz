import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq, sql } from "drizzle-orm";
import { v7 } from "uuid";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/client";
import { createSetInTransaction } from "@/server/services/sets";
import { finishSession, reviewCard, startSession } from "@/server/services/learning";
import { statsOverview } from "@/server/services/stats";

const testUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://siroquizz:siroquizz_local_only@localhost:5433/siroquizz_test";
if (!new URL(testUrl).pathname.endsWith("_test"))
  throw new Error("Integration database name must end in _test");
const connection = postgres(testUrl, { max: 1 });
const db = drizzle(connection, { schema }) as Database;
const a = v7(),
  b = v7();
const NOW = new Date("2026-10-04T05:00:00Z");
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
const minutesToday = async (userId: string) => (await statsOverview(db, userId, NOW)).today.minutes;
async function session(userId: string, startedAt: Date) {
  const { id } = await startSession(db, userId, { mode: "learn" });
  await db.update(schema.studySessions).set({ startedAt }).where(eq(schema.studySessions.id, id));
  return id;
}
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
const counts = { cardsSeen: 4, correct: 3, incorrect: 1 };

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

describe("study time", () => {
  it("counts engaged seconds, not how long the page stayed open", async () => {
    const id = await session(a, minutesAgo(180));
    await finishSession(db, a, id, { ...counts, activeSeconds: 600 }, NOW);
    expect(await minutesToday(a)).toBe(10);
  });
  it("never credits more engaged time than has elapsed", async () => {
    const id = await session(a, minutesAgo(5));
    await finishSession(db, a, id, { ...counts, activeSeconds: 3600 }, NOW);
    expect(await minutesToday(a)).toBe(5);
  });
  it("keeps updating a session reported again after the tab comes back", async () => {
    const id = await session(a, minutesAgo(60));
    await finishSession(db, a, id, { ...counts, activeSeconds: 120 }, minutesAgo(30));
    await finishSession(
      db,
      a,
      id,
      { cardsSeen: 9, correct: 7, incorrect: 2, activeSeconds: 900 },
      NOW,
    );
    // An out-of-order, smaller report must not shrink what was recorded.
    await finishSession(db, a, id, { ...counts, activeSeconds: 60 }, NOW);
    expect(await minutesToday(a)).toBe(15);
    const [row] = await db
      .select()
      .from(schema.studySessions)
      .where(eq(schema.studySessions.id, id));
    expect(row.cardsSeen).toBe(9);
  });
  it("caps legacy sessions without engaged time instead of counting an idle tab for hours", async () => {
    const id = await session(a, minutesAgo(12 * 60));
    await db
      .update(schema.studySessions)
      .set({ endedAt: NOW })
      .where(eq(schema.studySessions.id, id));
    expect(await minutesToday(a)).toBe(10);
  });
});

describe("per-user statistics", () => {
  it("only reports the requesting user's own activity", async () => {
    const set = await db.transaction((tx) => createSetInTransaction(tx, b, input));
    await reviewCard(db, b, {
      eventId: v7(),
      cardId: set.cards[0].id,
      rating: 3,
      mode: "learn",
      durationMs: 4000,
    });
    const id = await session(b, minutesAgo(30));
    await finishSession(db, b, id, { ...counts, activeSeconds: 1200 }, NOW);

    const mine = await statsOverview(db, a, NOW);
    expect(mine.today).toMatchObject({ cards: 0, minutes: 0 });
    expect(mine.knownCards).toBe(0);
    expect(mine.forecast.every((day) => day.count === 0)).toBe(true);
    expect(mine.accuracy).toEqual([]);
    const theirs = await statsOverview(db, b, NOW);
    expect(theirs.today.cards).toBe(4);
    expect(theirs.today.minutes).toBe(20);
  });
});
