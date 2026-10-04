import { describe, expect, it } from "vitest";
import { countAnswered, gradeQuestion, gradeTest, isAnswered, questionsForCards } from "./grade";
import type {
  MatchingQuestion,
  MultipleChoiceQuestion,
  Question,
  TrueFalseQuestion,
  WrittenQuestion,
} from "./types";

const mc: MultipleChoiceQuestion = {
  id: "q1",
  type: "multipleChoice",
  cardId: "a",
  promptSide: "term",
  prompt: "apple",
  options: [
    { id: "q1-correct", text: "táo" },
    { id: "q1-o0", text: "lê" },
  ],
  correctOptionId: "q1-correct",
};

const tf: TrueFalseQuestion = {
  id: "q2",
  type: "trueFalse",
  cardId: "b",
  promptSide: "term",
  prompt: "pear",
  candidate: "táo",
  isTrue: false,
  correctAnswer: "lê",
};

const written: WrittenQuestion = {
  id: "q3",
  type: "written",
  cardId: "c",
  promptSide: "definition",
  prompt: "quả mận",
  answer: "plum",
};

const matching: MatchingQuestion = {
  id: "q4",
  type: "matching",
  promptSide: "term",
  pairs: [
    { cardId: "d", prompt: "one", answer: "một" },
    { cardId: "e", prompt: "two", answer: "hai" },
  ],
  answers: [
    { cardId: "e", text: "hai" },
    { cardId: "d", text: "một" },
  ],
};

const questions: Question[] = [mc, tf, written, matching];

describe("gradeQuestion", () => {
  it("grades multiple choice", () => {
    expect(gradeQuestion(mc, { type: "multipleChoice", optionId: "q1-correct" }).correct).toBe(
      true,
    );
    expect(gradeQuestion(mc, { type: "multipleChoice", optionId: "q1-o0" }).correct).toBe(false);
  });

  it("grades true/false", () => {
    expect(gradeQuestion(tf, { type: "trueFalse", value: false }).correct).toBe(true);
    expect(gradeQuestion(tf, { type: "trueFalse", value: true }).correct).toBe(false);
  });

  it("grades written answers leniently and honours overrides", () => {
    expect(gradeQuestion(written, { type: "written", text: " Plum! " }).correct).toBe(true);
    expect(gradeQuestion(written, { type: "written", text: "plums" }).correct).toBe(false);
    expect(
      gradeQuestion(written, { type: "written", text: "plums", overridden: true }).correct,
    ).toBe(true);
  });

  it("gives one point per correct matching pair", () => {
    const result = gradeQuestion(matching, { type: "matching", matches: { d: "d", e: "d" } });
    expect(result).toMatchObject({ points: 1, maxPoints: 2, correct: false });
  });

  it("treats a missing answer as wrong", () => {
    expect(gradeQuestion(written, undefined)).toMatchObject({
      points: 0,
      maxPoints: 1,
      correct: false,
    });
    expect(gradeQuestion(matching, undefined)).toMatchObject({ points: 0, maxPoints: 2 });
  });

  it("ignores an answer of the wrong type", () => {
    expect(gradeQuestion(mc, { type: "trueFalse", value: true }).correct).toBe(false);
  });
});

describe("gradeTest", () => {
  it("sums points across questions", () => {
    const grade = gradeTest(questions, {
      q1: { type: "multipleChoice", optionId: "q1-correct" },
      q2: { type: "trueFalse", value: true },
      q3: { type: "written", text: "plum" },
      q4: { type: "matching", matches: { d: "d", e: "e" } },
    });
    expect(grade.score).toBe(4);
    expect(grade.total).toBe(5);
    expect(grade.results.map((r) => r.correct)).toEqual([true, false, true, true]);
  });
});

describe("isAnswered / countAnswered", () => {
  it("requires a non-empty written answer and every matching pair", () => {
    expect(isAnswered(written, { type: "written", text: "  " })).toBe(false);
    expect(isAnswered(matching, { type: "matching", matches: { d: "e" } })).toBe(false);
    expect(isAnswered(matching, { type: "matching", matches: { d: "e", e: "d" } })).toBe(true);
    expect(countAnswered(questions, { q1: { type: "multipleChoice", optionId: "x" } })).toBe(1);
  });
});

describe("questionsForCards", () => {
  it("lists the card ids of questions that were not fully correct", () => {
    const grade = gradeTest(questions, { q1: { type: "multipleChoice", optionId: "q1-correct" } });
    expect(questionsForCards(questions, grade)).toEqual(["b", "c", "d", "e"]);
  });
});
