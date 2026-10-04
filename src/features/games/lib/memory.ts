import { defaultRng, type Rng } from "@/lib/random";
import type { Card } from "@/lib/types";
import { createPairTiles, type PairTile } from "./match";

export const MEMORY_PAIRS = 6;
export const MISMATCH_HIDE_DELAY_MS = 800;

export interface MemoryState {
  cards: PairTile[];
  flippedIds: string[];
  matchedIds: string[];
  moves: number;
  locked: boolean;
  finished: boolean;
}

export type MemoryAction = { type: "flip"; id: string } | { type: "hide" };

export function createMemoryBoard(cards: readonly Card[], rng: Rng = defaultRng): MemoryState {
  return {
    cards: createPairTiles(cards, MEMORY_PAIRS, rng),
    flippedIds: [],
    matchedIds: [],
    moves: 0,
    locked: false,
    finished: false,
  };
}

function flip(state: MemoryState, id: string): MemoryState {
  if (state.locked || state.finished || state.flippedIds.includes(id) || state.matchedIds.includes(id)) return state;
  const flippedIds = [...state.flippedIds, id];
  if (flippedIds.length < 2) return { ...state, flippedIds };

  const [first, second] = flippedIds.map((flippedId) => state.cards.find((card) => card.id === flippedId));
  const moves = state.moves + 1;
  if (first && second && first.cardId === second.cardId) {
    const matchedIds = [...state.matchedIds, first.id, second.id];
    return { ...state, flippedIds: [], matchedIds, moves, finished: matchedIds.length === state.cards.length };
  }
  return { ...state, flippedIds, moves, locked: true };
}

export function memoryReducer(state: MemoryState, action: MemoryAction): MemoryState {
  if (action.type === "hide") return { ...state, flippedIds: [], locked: false };
  return flip(state, action.id);
}
