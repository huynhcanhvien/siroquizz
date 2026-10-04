import { splitGraphemes } from "@/lib/graphemes";
import { normalizeAnswer } from "@/lib/normalize";
import { defaultRng, shuffle, type Rng } from "@/lib/random";
import type { Card } from "@/lib/types";

const SHUFFLE_ATTEMPTS = 12;
const BASE_POINTS = 10;
const HINT_PENALTY = 3;
const MIN_POINTS = 1;

export const SCRAMBLE_ROUNDS = 10;

/** Multi-word terms scramble by word, single words by grapheme. */
export function splitUnits(term: string): string[] {
  const trimmed = term.trim().normalize("NFC");
  const words = trimmed.split(/\s+/).filter(Boolean);
  return words.length > 1 ? words : splitGraphemes(trimmed).filter((unit) => unit.trim() !== "");
}

export function scrambleUnits(units: readonly string[], rng: Rng = defaultRng): string[] {
  const original = units.join("\u0000");
  if (new Set(units).size < 2) return [...units];
  for (let attempt = 0; attempt < SHUFFLE_ATTEMPTS; attempt += 1) {
    const candidate = shuffle(units, rng);
    if (candidate.join("\u0000") !== original) return candidate;
  }
  return [...units.slice(1), units[0]];
}

export interface ScrambleTile {
  id: string;
  text: string;
}

export interface ScrambleRound {
  card: Card;
  units: string[];
  pool: ScrambleTile[];
  answer: string[];
  hintsUsed: number;
  status: "playing" | "correct" | "wrong";
}

export type ScrambleAction =
  | { type: "pick"; tileId: string }
  | { type: "unpick"; tileId: string }
  | { type: "clear" }
  | { type: "hint" };

export function createScrambleRound(card: Card, rng: Rng = defaultRng): ScrambleRound {
  const units = splitUnits(card.term);
  const pool = scrambleUnits(units, rng).map((text, index) => ({ id: `u${index}`, text }));
  return { card, units, pool, answer: [], hintsUsed: 0, status: "playing" };
}

const textOf = (round: ScrambleRound, tileId: string) => round.pool.find((tile) => tile.id === tileId)?.text ?? "";

function evaluate(round: ScrambleRound, answer: string[]): ScrambleRound {
  if (answer.length < round.units.length) return { ...round, answer, status: "playing" };
  const given = answer.map((id) => textOf(round, id)).join(" ");
  const correct = normalizeAnswer(given) === normalizeAnswer(round.units.join(" "));
  return { ...round, answer, status: correct ? "correct" : "wrong" };
}

function correctPrefixLength(round: ScrambleRound): number {
  const index = round.answer.findIndex((id, position) => textOf(round, id) !== round.units[position]);
  return index === -1 ? round.answer.length : index;
}

function hint(round: ScrambleRound): ScrambleRound {
  const prefix = round.answer.slice(0, correctPrefixLength(round));
  const nextText = round.units[prefix.length];
  const tile = round.pool.find((item) => item.text === nextText && !prefix.includes(item.id));
  if (!tile) return round;
  return evaluate({ ...round, hintsUsed: round.hintsUsed + 1 }, [...prefix, tile.id]);
}

export function scrambleReducer(round: ScrambleRound, action: ScrambleAction): ScrambleRound {
  if (round.status === "correct") return round;
  switch (action.type) {
    case "pick":
      return round.answer.includes(action.tileId) ? round : evaluate(round, [...round.answer, action.tileId]);
    case "unpick":
      return evaluate(round, round.answer.filter((id) => id !== action.tileId));
    case "clear":
      return { ...round, answer: [], status: "playing" };
    case "hint":
      return hint(round);
  }
}

export function roundPoints(hintsUsed: number): number {
  return Math.max(MIN_POINTS, BASE_POINTS - hintsUsed * HINT_PENALTY);
}
