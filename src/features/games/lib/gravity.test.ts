import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/random";
import type { Card } from "@/lib/types";
import { createGravityGame, fallDurationMs, gravityReducer, LEVEL_UP_EVERY, START_LIVES, type GravityState } from "./gravity";

const cards: Card[] = Array.from({ length: 3 }, (_, i) => ({ id: `c${i}`, term: `term${i}`, definition: `def${i}` }));

const answerFor = (state: GravityState) => state.current!.card.term;

describe("gravity game", () => {
  it("starts with a falling word and full lives", () => {
    const state = createGravityGame(cards, "term", createRng(1));
    expect(state.current?.progress).toBe(0);
    expect(state.lives).toBe(START_LIVES);
    expect(state.status).toBe("playing");
  });

  it("speeds up with each level but never below the minimum duration", () => {
    expect(fallDurationMs(2)).toBeLessThan(fallDurationMs(1));
    expect(fallDurationMs(50)).toBe(fallDurationMs(100));
  });

  it("advances the word over time", () => {
    const state = gravityReducer(createGravityGame(cards, "term", createRng(1)), { type: "tick", dtMs: fallDurationMs(1) / 2 });
    expect(state.current?.progress).toBeCloseTo(0.5);
  });

  it("scores a correct answer and spawns the next word", () => {
    const start = createGravityGame(cards, "term", createRng(2));
    const first = start.current!.id;
    const state = gravityReducer(start, { type: "submit", text: ` ${answerFor(start).toUpperCase()} ` });
    expect(state.score).toBe(10);
    expect(state.cleared).toBe(1);
    expect(state.current?.id).not.toBe(first);
    expect(state.lastResult).toBe("correct");
  });

  it("flags a wrong answer without losing a life", () => {
    const state = gravityReducer(createGravityGame(cards, "term", createRng(3)), { type: "submit", text: "nope" });
    expect(state.lastResult).toBe("wrong");
    expect(state.lives).toBe(START_LIVES);
  });

  it("can be played by typing the definition instead", () => {
    const start = createGravityGame(cards, "definition", createRng(3));
    const state = gravityReducer(start, { type: "submit", text: start.current!.card.definition });
    expect(state.lastResult).toBe("correct");
  });

  it("loses a life and records the miss when a word lands", () => {
    const start = createGravityGame(cards, "term", createRng(4));
    const missedCard = start.current!.card;
    const state = gravityReducer(start, { type: "tick", dtMs: fallDurationMs(1) + 1 });
    expect(state.lives).toBe(START_LIVES - 1);
    expect(state.missed).toEqual([missedCard]);
    expect(state.lastResult).toBe("missed");
  });

  it("ends the game when lives run out", () => {
    let state = createGravityGame(cards, "term", createRng(5));
    for (let i = 0; i < START_LIVES; i += 1) state = gravityReducer(state, { type: "tick", dtMs: 60_000 });
    expect(state.status).toBe("over");
    expect(gravityReducer(state, { type: "tick", dtMs: 10 })).toBe(state);
  });

  it("levels up after enough correct answers", () => {
    let state = createGravityGame(cards, "term", createRng(6));
    for (let i = 0; i < LEVEL_UP_EVERY; i += 1) state = gravityReducer(state, { type: "submit", text: answerFor(state) });
    expect(state.level).toBe(2);
  });

  it("pauses and resumes; paused games do not advance", () => {
    let state = gravityReducer(createGravityGame(cards, "term", createRng(7)), { type: "pause" });
    expect(gravityReducer(state, { type: "tick", dtMs: 1000 })).toBe(state);
    state = gravityReducer(state, { type: "resume" });
    expect(state.status).toBe("playing");
  });

  it("does not record the same card twice as missed", () => {
    let state = createGravityGame(cards.slice(0, 1), "term", createRng(8));
    state = gravityReducer(state, { type: "tick", dtMs: 60_000 });
    state = gravityReducer(state, { type: "tick", dtMs: 60_000 });
    expect(state.missed).toHaveLength(1);
  });
});
