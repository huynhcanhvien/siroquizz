import { isAnswerMatch } from "@/lib/normalize";
import { defaultRng, shuffle, type Rng } from "@/lib/random";
import type { Card, Side } from "@/lib/types";

export const START_LIVES = 3;
export const LEVEL_UP_EVERY = 5;
const BASE_FALL_MS = 12_000;
const FALL_STEP_MS = 1_500;
const MIN_FALL_MS = 4_000;
const POINTS_PER_WORD = 10;

export function fallDurationMs(level: number): number {
  return Math.max(MIN_FALL_MS, BASE_FALL_MS - (level - 1) * FALL_STEP_MS);
}

export interface FallingWord {
  id: string;
  card: Card;
  /** 0 at the top, 1 when it hits the ground. */
  progress: number;
}

export interface GravityState {
  status: "playing" | "paused" | "over";
  /** What the player types; the other side falls. */
  answerSide: Side;
  deck: Card[];
  cursor: number;
  current: FallingWord | null;
  lives: number;
  score: number;
  level: number;
  streak: number;
  cleared: number;
  missed: Card[];
  lastResult: "correct" | "wrong" | "missed" | null;
}

export type GravityAction =
  | { type: "tick"; dtMs: number }
  | { type: "submit"; text: string }
  | { type: "pause" }
  | { type: "resume" };

function spawn(state: GravityState): GravityState {
  const card = state.deck[state.cursor % state.deck.length];
  return { ...state, cursor: state.cursor + 1, current: { id: `w${state.cursor}`, card, progress: 0 } };
}

export function createGravityGame(cards: readonly Card[], answerSide: Side, rng: Rng = defaultRng): GravityState {
  return spawn({
    status: "playing",
    answerSide,
    deck: shuffle(cards, rng),
    cursor: 0,
    current: null,
    lives: START_LIVES,
    score: 0,
    level: 1,
    streak: 0,
    cleared: 0,
    missed: [],
    lastResult: null,
  });
}

function landed(state: GravityState, card: Card): GravityState {
  const lives = state.lives - 1;
  const missed = state.missed.some((item) => item.id === card.id) ? state.missed : [...state.missed, card];
  const next = { ...state, lives, missed, lastResult: "missed" as const };
  return lives <= 0 ? { ...next, status: "over", current: null } : spawn(next);
}

function tick(state: GravityState, dtMs: number): GravityState {
  if (state.status !== "playing" || !state.current) return state;
  const progress = state.current.progress + dtMs / fallDurationMs(state.level);
  if (progress >= 1) return landed(state, state.current.card);
  return { ...state, current: { ...state.current, progress } };
}

function submit(state: GravityState, text: string): GravityState {
  if (state.status !== "playing" || !state.current) return state;
  const expected = state.answerSide === "term" ? state.current.card.term : state.current.card.definition;
  if (!isAnswerMatch(text, expected)) return { ...state, lastResult: "wrong" };
  const streak = state.streak + 1;
  const levelUp = streak >= LEVEL_UP_EVERY;
  return spawn({
    ...state,
    score: state.score + POINTS_PER_WORD * state.level,
    cleared: state.cleared + 1,
    level: levelUp ? state.level + 1 : state.level,
    streak: levelUp ? 0 : streak,
    lastResult: "correct",
  });
}

export function gravityReducer(state: GravityState, action: GravityAction): GravityState {
  switch (action.type) {
    case "tick":
      return tick(state, action.dtMs);
    case "submit":
      return submit(state, action.text);
    case "pause":
      return state.status === "playing" ? { ...state, status: "paused" } : state;
    case "resume":
      return state.status === "paused" ? { ...state, status: "playing" } : state;
  }
}
