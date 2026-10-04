export type LearnLevel = "multipleChoice" | "written";
export interface LearnItem {
  cardId: string;
  level: LearnLevel;
}
export interface LearnState {
  queue: LearnItem[];
  round: LearnItem[];
  deferred: LearnItem[];
  known: string[];
  total: number;
  roundNumber: number;
  correct: number;
  incorrect: number;
  phase: "question" | "feedback" | "round" | "done";
  lastCorrect: boolean | null;
  written: boolean;
}
export const ROUND_SIZE = 7;
export function createLearn(ids: readonly string[], written = true): LearnState {
  const queue = [...new Set(ids)].map((cardId) => ({ cardId, level: "multipleChoice" as const }));
  return {
    queue: queue.slice(ROUND_SIZE),
    round: queue.slice(0, ROUND_SIZE),
    deferred: [],
    known: [],
    total: queue.length,
    roundNumber: 1,
    correct: 0,
    incorrect: 0,
    phase: queue.length ? "question" : "done",
    lastCorrect: null,
    written,
  };
}
export type LearnAction =
  { type: "answer"; correct: boolean } | { type: "continue" } | { type: "nextRound" };
export function learnReducer(state: LearnState, action: LearnAction): LearnState {
  const item = state.round[0];
  if (action.type === "answer" && state.phase === "question" && item) {
    const known = action.correct && (item.level === "written" || !state.written);
    return {
      ...state,
      phase: "feedback",
      lastCorrect: action.correct,
      correct: state.correct + Number(action.correct),
      incorrect: state.incorrect + Number(!action.correct),
      known: known ? [...state.known, item.cardId] : state.known,
      deferred: known
        ? state.deferred
        : [
            ...state.deferred,
            { cardId: item.cardId, level: action.correct ? "written" : item.level },
          ],
    };
  }
  if (action.type === "continue" && state.phase === "feedback") {
    const round = state.round.slice(1);
    return {
      ...state,
      round,
      lastCorrect: null,
      phase: round.length ? "question" : state.known.length === state.total ? "done" : "round",
    };
  }
  if (action.type === "nextRound" && state.phase === "round") {
    const queued = [...state.queue, ...state.deferred];
    return {
      ...state,
      queue: queued.slice(ROUND_SIZE),
      round: queued.slice(0, ROUND_SIZE),
      deferred: [],
      roundNumber: state.roundNumber + 1,
      phase: queued.length ? "question" : "done",
    };
  }
  return state;
}
