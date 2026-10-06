import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/random";
import type { Card } from "@/lib/types";
import { createGravityGame, fallDurationMs } from "./gravity";
import { createMatchBoard, PENALTY_MS } from "./match";
import { MIN_PAIR_MS, replayGravity, replayMatch, type GameEvent } from "./replay";

const cards: Card[] = Array.from({ length: 8 }, (_, i) => ({
  id: `c${i}`,
  term: `term${i}`,
  definition: `def${i}`,
}));
const SEED = 42;
const elapsedMs = 600_000;

/** A clean Match run: each pair clicked `gap` ms after the previous one. */
function cleanMatch(gap: number, wrongFirst = false): GameEvent[] {
  const board = createMatchBoard(cards, createRng(SEED));
  const byCard = new Map<string, string[]>();
  for (const tile of board.tiles) byCard.set(tile.cardId, [...(byCard.get(tile.cardId) ?? []), tile.id]);
  const events: GameEvent[] = [];
  let t = 0;
  if (wrongFirst) {
    const [a, b] = [...byCard.values()];
    events.push({ t: (t += gap), tileId: a[0] }, { t: (t += 100), tileId: b[0] });
  }
  for (const [first, second] of byCard.values())
    events.push({ t: (t += gap / 2), tileId: first }, { t: (t += gap / 2), tileId: second });
  return events;
}

describe("Match replay", () => {
  it("accepts a plausible game and computes the time itself, with penalties", () => {
    expect(replayMatch(cards, SEED, cleanMatch(1200), elapsedMs)).toEqual({
      verified: true,
      score: 6,
      timeMs: 6 * 1200,
    });
    const withMistake = replayMatch(cards, SEED, cleanMatch(1200, true), elapsedMs);
    expect(withMistake).toMatchObject({ verified: true, timeMs: 1200 + 100 + 6 * 1200 + PENALTY_MS });
  });
  it("rejects pairs matched faster than a person can", () => {
    expect(replayMatch(cards, SEED, cleanMatch(MIN_PAIR_MS - 50), elapsedMs)).toMatchObject({
      verified: false,
      reason: "too_fast",
    });
  });
  it("rejects a board that does not come from the session's seed", () => {
    expect(replayMatch(cards, SEED + 1, cleanMatch(1200), elapsedMs)).toMatchObject({
      verified: false,
    });
  });
  it("rejects unfinished games, unknown tiles, time travel and clocks beyond the session", () => {
    expect(replayMatch(cards, SEED, cleanMatch(1200).slice(0, 4), elapsedMs)).toMatchObject({
      reason: "unfinished",
    });
    expect(replayMatch(cards, SEED, [{ t: 500, tileId: "nope" }], elapsedMs)).toMatchObject({
      reason: "invalid_event",
    });
    const backwards = cleanMatch(1200);
    backwards[3] = { ...backwards[3], t: 1 };
    expect(replayMatch(cards, SEED, backwards, elapsedMs)).toMatchObject({ reason: "invalid_event" });
    expect(replayMatch(cards, SEED, cleanMatch(1200), 1000)).toMatchObject({ reason: "clock" });
  });
});

/** A Gravity run answering `count` words correctly, then letting the rest fall. */
function gravityRun(count: number, answerGap: number): GameEvent[] {
  const deck = createGravityGame(cards, "term", createRng(SEED)).deck;
  const events: GameEvent[] = [];
  let t = 0,
    level = 1,
    streak = 0;
  for (let i = 0; i < count; i++) {
    events.push({ t: (t += answerGap), text: deck[i % deck.length].term });
    streak++;
    if (streak >= 5) {
      level++;
      streak = 0;
    }
  }
  for (let miss = 0; miss < 3; miss++) events.push({ t: (t += fallDurationMs(level)), missed: true });
  return events;
}

describe("Gravity replay", () => {
  it("scores correct answers itself, levelling up every five words", () => {
    // 5 words at level 1 (10 each), 2 at level 2 (20 each).
    expect(replayGravity(cards, "term", SEED, gravityRun(7, 1500), elapsedMs)).toMatchObject({
      verified: true,
      score: 5 * 10 + 2 * 20,
    });
  });
  it("rejects answers typed before the word could be read", () => {
    expect(replayGravity(cards, "term", SEED, gravityRun(3, 100), elapsedMs)).toMatchObject({
      verified: false,
      reason: "too_fast",
    });
  });
  it("rejects wrong answers counted as right and words landing early", () => {
    const wrong = gravityRun(2, 1500);
    wrong[0] = { t: wrong[0].t, text: "not the word" };
    expect(replayGravity(cards, "term", SEED, wrong, elapsedMs)).toMatchObject({
      reason: "invalid_event",
    });
    const early = gravityRun(0, 1500);
    early[0] = { t: 1000, missed: true };
    expect(replayGravity(cards, "term", SEED, early, elapsedMs)).toMatchObject({ reason: "too_fast" });
  });
});
