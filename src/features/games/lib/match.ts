import { defaultRng, shuffle, type Rng } from "@/lib/random";
import type { Card, Side } from "@/lib/types";

export const MATCH_PAIRS = 6;
export const PENALTY_MS = 1000;

export interface PairTile {
  id: string;
  cardId: string;
  side: Side;
  text: string;
}

/** One term tile and one definition tile per card, shuffled. Shared by Match and Memory. */
export function createPairTiles(cards: readonly Card[], pairs: number, rng: Rng): PairTile[] {
  const picked = shuffle(cards, rng).slice(0, pairs);
  const tiles = picked.flatMap((card) => [
    { id: `${card.id}:term`, cardId: card.id, side: "term" as const, text: card.term },
    { id: `${card.id}:definition`, cardId: card.id, side: "definition" as const, text: card.definition },
  ]);
  return shuffle(tiles, rng);
}

export interface MatchState {
  tiles: PairTile[];
  selectedId: string | null;
  matchedIds: string[];
  wrongIds: string[];
  penaltyMs: number;
  finished: boolean;
}

export type MatchAction = { type: "select"; tileId: string } | { type: "clearWrong" };

export function createMatchBoard(cards: readonly Card[], rng: Rng = defaultRng): MatchState {
  return {
    tiles: createPairTiles(cards, MATCH_PAIRS, rng),
    selectedId: null,
    matchedIds: [],
    wrongIds: [],
    penaltyMs: 0,
    finished: false,
  };
}

function select(state: MatchState, tileId: string): MatchState {
  if (state.finished || state.matchedIds.includes(tileId)) return state;
  if (state.selectedId === null) return { ...state, selectedId: tileId, wrongIds: [] };
  if (state.selectedId === tileId) return { ...state, selectedId: null };

  const first = state.tiles.find((tile) => tile.id === state.selectedId);
  const second = state.tiles.find((tile) => tile.id === tileId);
  if (!first || !second) return state;

  if (first.cardId === second.cardId) {
    const matchedIds = [...state.matchedIds, first.id, second.id];
    return { ...state, selectedId: null, matchedIds, wrongIds: [], finished: matchedIds.length === state.tiles.length };
  }
  return { ...state, selectedId: null, wrongIds: [first.id, second.id], penaltyMs: state.penaltyMs + PENALTY_MS };
}

export function matchReducer(state: MatchState, action: MatchAction): MatchState {
  if (action.type === "clearWrong") return { ...state, wrongIds: [] };
  return select(state, action.tileId);
}
