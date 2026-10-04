export interface DeckState {
  order: string[];
  index: number;
  flipped: boolean;
  known: string[];
  learning: string[];
  finished: boolean;
}

export type DeckAction =
  | { type: "flip" }
  | { type: "next" }
  | { type: "prev" }
  | { type: "mark"; status: "known" | "learning" }
  | { type: "restart"; cardIds: string[] };

export function createDeck(cardIds: readonly string[]): DeckState {
  return { order: [...cardIds], index: 0, flipped: false, known: [], learning: [], finished: false };
}

export function currentCardId(state: DeckState): string | undefined {
  return state.order[state.index];
}

function advance(state: DeckState): DeckState {
  if (state.index >= state.order.length - 1) return { ...state, flipped: false, finished: true };
  return { ...state, index: state.index + 1, flipped: false };
}

function mark(state: DeckState, status: "known" | "learning"): DeckState {
  const id = currentCardId(state);
  if (!id || state.finished) return state;
  const known = state.known.filter((item) => item !== id);
  const learning = state.learning.filter((item) => item !== id);
  const marked =
    status === "known" ? { ...state, known: [...known, id], learning } : { ...state, known, learning: [...learning, id] };
  return advance(marked);
}

export function deckReducer(state: DeckState, action: DeckAction): DeckState {
  switch (action.type) {
    case "flip":
      return state.finished ? state : { ...state, flipped: !state.flipped };
    case "next":
      return state.order.length === 0 || state.finished ? state : advance(state);
    case "prev":
      if (state.finished) return { ...state, finished: false, flipped: false };
      return state.index === 0 ? state : { ...state, index: state.index - 1, flipped: false };
    case "mark":
      return mark(state, action.status);
    case "restart":
      return createDeck(action.cardIds);
  }
}
