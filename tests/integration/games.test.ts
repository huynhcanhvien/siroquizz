import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq, sql } from "drizzle-orm";
import { v7 } from "uuid";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/client";
import { createRng } from "@/lib/random";
import type { Card } from "@/lib/types";
import { createMatchBoard } from "@/features/games/lib/match";
import { createGravityGame } from "@/features/games/lib/gravity";
import type { GameEvent } from "@/features/games/lib/replay";
import { createSetInTransaction } from "@/server/services/sets";
import { setVisibility } from "@/server/services/sharing";
import { finishGameSession, leaderboard, startGameSession } from "@/server/services/games";
import { assignSet, createClass, getClass, joinClass } from "@/server/services/classes";

vi.mock("@/server/ai/groq", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/ai/groq")>()),
  groqJson: vi.fn(async () => ({
    data: { violation: false, category: "safe", reason: "ok" },
    usage: {},
    model: "m",
  })),
}));
vi.mock("@/server/rate-limit", () => ({ enforceLimit: vi.fn() }));
vi.mock("@/server/env", () => ({ getServerEnv: () => ({ AI_GLOBAL_DAILY_CREDITS: 480 }) }));

const url =
  process.env.TEST_DATABASE_URL ??
  "postgresql://siroquizz:siroquizz_local_only@localhost:5433/siroquizz_test";
if (!new URL(url).pathname.endsWith("_test")) throw new Error("Test DB required");
const connection = postgres(url, { max: 3 }),
  db = drizzle(connection, { schema }) as Database,
  owner = v7(),
  player = v7(),
  stranger = v7();

async function makeSet() {
  return db.transaction((tx) =>
    createSetInTransaction(tx, owner, {
      title: "Game words",
      description: "",
      termLang: "en",
      definitionLang: "vi",
      source: "manual",
      cards: Array.from({ length: 8 }, (_, i) => ({ term: `term${i}`, definition: `def${i}` })),
    }),
  );
}
/** Pretends the game started `ms` ago, as a real game would have. */
const backdate = (sessionId: string, ms: number) =>
  db
    .update(schema.gameSessions)
    .set({ startedAt: new Date(Date.now() - ms) })
    .where(eq(schema.gameSessions.id, sessionId));
/** Plays Match on the board the session's seed produces, one pair every `gap` ms. */
function playMatch(deck: Card[], seed: number, gap: number): GameEvent[] {
  const board = createMatchBoard(deck, createRng(seed));
  const pairs = new Map<string, string[]>();
  for (const tile of board.tiles)
    pairs.set(tile.cardId, [...(pairs.get(tile.cardId) ?? []), tile.id]);
  let t = 0;
  return [...pairs.values()].flatMap(([a, b]) => [
    { t: (t += gap / 2), tileId: a },
    { t: (t += gap / 2), tileId: b },
  ]);
}
async function rankedMatch(userId: string, setId: string, deck: Card[], gap: number) {
  const session = await startGameSession(db, userId, setId, { game: "match" });
  expect(session.cardIds).toEqual(deck.map((card) => card.id));
  // The game took as long as its moves (6 pairs), plus a moment to load the board.
  await backdate(session.id, 6 * gap + 1000);
  return finishGameSession(db, userId, session.id, { events: playMatch(deck, session.seed, gap) });
}

beforeAll(() => migrate(db, { migrationsFolder: "drizzle" }));
beforeEach(async () => {
  await db.execute(sql`truncate "user" cascade`);
  await db.insert(schema.user).values([
    {
      id: owner,
      name: "Owner",
      email: "g-owner@example.com",
      emailVerified: true,
      createdAt: new Date(Date.now() - 2 * 86400_000),
    },
    {
      id: player,
      name: "Player",
      email: "g-player@example.com",
      emailVerified: true,
      createdAt: new Date(Date.now() - 2 * 86400_000),
    },
    {
      id: stranger,
      name: "Stranger",
      email: "g-stranger@example.com",
      emailVerified: true,
      createdAt: new Date(Date.now() - 2 * 86400_000),
    },
  ]);
});
afterAll(() => connection.end());

it("ranks verified Match games by the server-computed time", async () => {
  const set = await makeSet();
  await setVisibility(db, owner, set.id, { visibility: "unlisted" });
  expect(await rankedMatch(owner, set.id, set.cards, 2000)).toEqual({
    verified: true,
    score: 6,
    timeMs: 12_000,
  });
  // Others may play a shared set without copying it.
  expect(await rankedMatch(player, set.id, set.cards, 1000)).toMatchObject({ verified: true });
  const board = await leaderboard(db, owner, set.id, new URLSearchParams({ game: "match" }));
  expect(board.entries.map((entry) => [entry.name, entry.timeMs])).toEqual([
    ["Player", 6000],
    ["Owner", 12_000],
  ]);
  expect(board.me).toMatchObject({ rank: 2, isMe: true });
});

it("keeps cheated and implausible games off the board", async () => {
  const set = await makeSet();
  expect(await rankedMatch(owner, set.id, set.cards, 100)).toEqual({
    verified: false,
    reason: "too_fast",
  });
  // Claiming a game longer than the session has existed.
  const session = await startGameSession(db, owner, set.id, { game: "match" });
  await expect(
    finishGameSession(db, owner, session.id, { events: playMatch(set.cards, session.seed, 2000) }),
  ).resolves.toEqual({ verified: false, reason: "clock" });
  // A session is checked once.
  await expect(finishGameSession(db, owner, session.id, { events: [] })).rejects.toMatchObject({
    status: 404,
  });
  const board = await leaderboard(db, owner, set.id, new URLSearchParams({ game: "match" }));
  expect(board.entries).toEqual([]);
  const [stored] = await db
    .select()
    .from(schema.gameSessions)
    .where(eq(schema.gameSessions.id, session.id));
  expect(stored).toMatchObject({ verified: false, rejectedReason: "clock", timeMs: null });
});

it("keeps each person's best result only and ranks Gravity by score", async () => {
  const set = await makeSet();
  await rankedMatch(owner, set.id, set.cards, 3000);
  await rankedMatch(owner, set.id, set.cards, 1500);
  const match = await leaderboard(db, owner, set.id, new URLSearchParams({ game: "match" }));
  expect(match.entries).toHaveLength(1);
  expect(match.entries[0].timeMs).toBe(9000);

  const session = await startGameSession(db, owner, set.id, { game: "gravity" });
  await backdate(session.id, 60_000);
  const deck = createGravityGame(set.cards, "term", createRng(session.seed)).deck;
  const result = await finishGameSession(db, owner, session.id, {
    events: [
      { t: 1500, text: deck[0].term },
      { t: 3000, text: deck[1].term },
    ],
  });
  expect(result).toEqual({ verified: true, score: 20, timeMs: 3000 });
  const gravity = await leaderboard(db, owner, set.id, new URLSearchParams({ game: "gravity" }));
  expect(gravity.entries[0]).toMatchObject({ score: 20, rank: 1 });
});

it("limits games and boards to sets the player may study, and ranks within a class", async () => {
  const set = await makeSet();
  await expect(startGameSession(db, stranger, set.id, { game: "match" })).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    leaderboard(db, stranger, set.id, new URLSearchParams({ game: "match" })),
  ).rejects.toMatchObject({ status: 404 });
  const { id: classId } = await createClass(db, owner, { name: "Game class" });
  const { joinCode } = (await getClass(db, owner, classId)) as { joinCode: string };
  await joinClass(db, player, { code: joinCode });
  await assignSet(db, owner, classId, set.id, {});
  await rankedMatch(player, set.id, set.cards, 1000);
  const classBoard = await leaderboard(
    db,
    player,
    set.id,
    new URLSearchParams({ game: "match", classId }),
  );
  expect(classBoard.entries.map((entry) => entry.name)).toEqual(["Player"]);
  // Someone outside the class cannot ask for its board.
  await setVisibility(db, owner, set.id, { visibility: "unlisted" });
  await expect(
    leaderboard(db, stranger, set.id, new URLSearchParams({ game: "match", classId })),
  ).rejects.toMatchObject({ status: 404 });
});

it("never ranks a Match time shorter than the real time the session took", async () => {
  const set = await makeSet();
  const session = await startGameSession(db, owner, set.id, { game: "match" });
  // Moves claim 12s, but the session has been open for 40s.
  await backdate(session.id, 40_000);
  const result = await finishGameSession(db, owner, session.id, {
    events: playMatch(set.cards, session.seed, 2000),
  });
  expect(result).toMatchObject({ verified: true });
  expect((result as { timeMs: number }).timeMs).toBeGreaterThanOrEqual(35_000);
});
