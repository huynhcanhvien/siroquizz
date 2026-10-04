import { expect, it } from "vitest";
import { createLearn, learnReducer } from "./learn-engine";
it("masters 20 cards only after both stages, in rounds of at most seven", () => {
  let state = createLearn(Array.from({ length: 20 }, (_, i) => String(i))),
    seen = 0;
  while (state.phase !== "done") {
    expect(state.round.length).toBeLessThanOrEqual(7);
    if (state.phase === "question") {
      seen++;
      state = learnReducer(state, { type: "answer", correct: true });
    } else if (state.phase === "feedback") state = learnReducer(state, { type: "continue" });
    else state = learnReducer(state, { type: "nextRound" });
  }
  expect(seen).toBe(40);
  expect(state.known).toHaveLength(20);
  expect(state.correct).toBe(40);
});
it("incorrect cards return at their current stage and feedback cannot be answered twice", () => {
  let state = createLearn(["a"]);
  state = learnReducer(state, { type: "answer", correct: false });
  expect(learnReducer(state, { type: "answer", correct: true })).toBe(state);
  state = learnReducer(state, { type: "continue" });
  state = learnReducer(state, { type: "nextRound" });
  expect(state.round[0]).toEqual({ cardId: "a", level: "multipleChoice" });
  state = learnReducer(state, { type: "answer", correct: true });
  state = learnReducer(state, { type: "continue" });
  state = learnReducer(state, { type: "nextRound" });
  expect(state.round[0].level).toBe("written");
  state = learnReducer(state, { type: "answer", correct: false });
  state = learnReducer(state, { type: "continue" });
  state = learnReducer(state, { type: "nextRound" });
  expect(state.round[0].level).toBe("written");
  expect(state.known).toHaveLength(0);
});
it("supports empty/duplicate input and disabling written answers", () => {
  expect(createLearn([]).phase).toBe("done");
  let state = createLearn(["a", "a"], false);
  expect(state.total).toBe(1);
  expect(learnReducer(state, { type: "nextRound" })).toBe(state);
  state = learnReducer(state, { type: "answer", correct: true });
  state = learnReducer(state, { type: "continue" });
  expect(state.phase).toBe("done");
});
