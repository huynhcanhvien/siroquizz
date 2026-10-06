import { isAnswerMatch } from "@/lib/normalize";
import { createRng } from "@/lib/random";
import type { Card, Side } from "@/lib/types";
import { createGravityGame, fallDurationMs, LEVEL_UP_EVERY, START_LIVES } from "./gravity";
import { createMatchBoard, matchReducer } from "./match";

/**
 * Server-side verification of ranked games. The board comes from the session's seed, the client
 * sends only what the player did and when, and the result is computed here by replaying it —
 * never taken from the client.
 */

/** No person reads two tiles and matches them faster than this. */
export const MIN_PAIR_MS = 300;
/** Nor reads a falling word and types its answer faster than this. */
export const MIN_ANSWER_MS = 300;
/** Slack for timers and network between the browser and the server. */
const CLOCK_TOLERANCE_MS = 3000;
const LANDING_TOLERANCE_MS = 250;
export const MAX_EVENTS = 2000;

/** Milliseconds since the game started, plus what happened. */
export type GameEvent =
  | { t: number; tileId: string }
  | { t: number; text: string }
  | { t: number; missed: true };
export type ReplayResult =
  | { verified: true; score: number; timeMs: number }
  | { verified: false; reason: "invalid_event" | "unfinished" | "too_fast" | "clock" };

const reject = (reason: Extract<ReplayResult, { verified: false }>["reason"]): ReplayResult => ({
  verified: false,
  reason,
});
/** Times must be finite, start at zero or later and never go backwards. */
function orderedTimes(events: readonly GameEvent[]) {
  let last = 0;
  for (const event of events) {
    if (!Number.isFinite(event.t) || event.t < last) return false;
    last = event.t;
  }
  return events.length <= MAX_EVENTS;
}

/** Replays a Match game; the time is the last click plus the penalties for wrong pairs. */
export function replayMatch(
  cards: readonly Card[],
  seed: number,
  events: readonly GameEvent[],
  elapsedMs: number,
): ReplayResult {
  if (!orderedTimes(events)) return reject("invalid_event");
  let state = createMatchBoard(cards, createRng(seed));
  const tileIds = new Set(state.tiles.map((tile) => tile.id));
  let lastPairAt = 0;
  for (const event of events) {
    if (!("tileId" in event) || !tileIds.has(event.tileId)) return reject("invalid_event");
    const before = state.matchedIds.length;
    state = matchReducer(state, { type: "select", tileId: event.tileId });
    if (state.matchedIds.length > before) {
      if (event.t - lastPairAt < MIN_PAIR_MS) return reject("too_fast");
      lastPairAt = event.t;
    }
  }
  if (!state.finished) return reject("unfinished");
  const lastAt = events.at(-1)!.t;
  if (lastAt > elapsedMs + CLOCK_TOLERANCE_MS) return reject("clock");
  return { verified: true, score: state.matchedIds.length / 2, timeMs: lastAt + state.penaltyMs };
}

/**
 * Replays a Gravity game. Each event is either a typed answer or a word landing. A correct
 * answer scores 10 × level and levels up every five in a row; a word may only land after it had
 * time to fall (pauses only make that later).
 */
export function replayGravity(
  cards: readonly Card[],
  answerSide: Side,
  seed: number,
  events: readonly GameEvent[],
  elapsedMs: number,
): ReplayResult {
  if (!orderedTimes(events)) return reject("invalid_event");
  const deck = createGravityGame(cards, answerSide, createRng(seed)).deck;
  let cursor = 0,
    spawnedAt = 0,
    level = 1,
    streak = 0,
    score = 0,
    lives = START_LIVES;
  for (const event of events) {
    if (lives <= 0) return reject("invalid_event");
    const card = deck[cursor % deck.length];
    if ("missed" in event) {
      if (event.t - spawnedAt < fallDurationMs(level) - LANDING_TOLERANCE_MS) return reject("too_fast");
      lives--;
    } else if ("text" in event) {
      const expected = answerSide === "term" ? card.term : card.definition;
      if (!isAnswerMatch(event.text, expected)) return reject("invalid_event");
      if (event.t - spawnedAt < MIN_ANSWER_MS) return reject("too_fast");
      score += 10 * level;
      streak++;
      if (streak >= LEVEL_UP_EVERY) {
        level++;
        streak = 0;
      }
    } else return reject("invalid_event");
    cursor++;
    spawnedAt = event.t;
  }
  const lastAt = events.at(-1)?.t ?? 0;
  if (lastAt > elapsedMs + CLOCK_TOLERANCE_MS) return reject("clock");
  return { verified: true, score, timeMs: lastAt };
}
