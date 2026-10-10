import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/random";
import type { Card } from "@/lib/types";
import { allocateCounts, generateTest, maxQuestionCount } from "./generate-test";
import type {
  MatchingQuestion,
  MultipleChoiceQuestion,
  TrueFalseQuestion,
  WrittenQuestion,
} from "./types";

const cards: Card[] = Array.from({ length: 10 }, (_, i) => ({
  id: `c${i}`,
  term: `term ${i}`,
  definition: `definition ${i}`,
}));

const cardById = new Map(cards.map((card) => [card.id, card]));

describe("allocateCounts", () => {
  it("splits the count evenly and gives the remainder to the first types", () => {
    expect(allocateCounts(10, ["multipleChoice", "trueFalse", "written"])).toEqual({
      multipleChoice: 4,
      trueFalse: 3,
      written: 3,
    });
  });

  it("moves a single matching slot to another type because one pair cannot be matched", () => {
    expect(allocateCounts(5, ["multipleChoice", "trueFalse", "written", "matching"])).toEqual({
      multipleChoice: 3,
      trueFalse: 1,
      written: 1,
      matching: 0,
    });
  });
});

describe("maxQuestionCount", () => {
  it("is the number of cards", () => {
    expect(maxQuestionCount(cards)).toBe(10);
  });
});

describe("generateTest", () => {
  it("is deterministic for the same seed", () => {
    const config = {
      questionCount: 8,
      answerWith: "both",
      types: ["multipleChoice", "trueFalse", "written", "matching"],
    } as const;
    expect(generateTest(cards, { ...config, types: [...config.types] }, createRng(5))).toEqual(
      generateTest(cards, { ...config, types: [...config.types] }, createRng(5)),
    );
  });

  it("covers exactly questionCount distinct cards across all questions", () => {
    const questions = generateTest(
      cards,
      {
        questionCount: 9,
        answerWith: "definition",
        types: ["multipleChoice", "trueFalse", "written", "matching"],
      },
      createRng(1),
    );
    const covered = questions.flatMap((q) =>
      q.type === "matching" ? q.pairs.map((p) => p.cardId) : [q.cardId],
    );
    expect(covered).toHaveLength(9);
    expect(new Set(covered).size).toBe(9);
  });

  it("builds multiple choice questions with 4 unique options including the right one", () => {
    const questions = generateTest(
      cards,
      { questionCount: 5, answerWith: "definition", types: ["multipleChoice"] },
      createRng(2),
    );
    for (const question of questions as MultipleChoiceQuestion[]) {
      const card = cardById.get(question.cardId)!;
      expect(question.promptSide).toBe("term");
      expect(question.prompt).toBe(card.term);
      expect(question.options).toHaveLength(4);
      expect(new Set(question.options.map((o) => o.text)).size).toBe(4);
      const correct = question.options.find((o) => o.id === question.correctOptionId);
      expect(correct?.text).toBe(card.definition);
    }
  });

  it("answers with the term when asked to", () => {
    const [question] = generateTest(
      cards,
      { questionCount: 1, answerWith: "term", types: ["written"] },
      createRng(3),
    ) as WrittenQuestion[];
    const card = cardById.get(question.cardId)!;
    expect(question.prompt).toBe(card.definition);
    expect(question.answer).toBe(card.term);
  });

  it("uses fewer options when the set is small", () => {
    const small = cards.slice(0, 3);
    const [question] = generateTest(
      small,
      { questionCount: 1, answerWith: "definition", types: ["multipleChoice"] },
      createRng(4),
    ) as MultipleChoiceQuestion[];
    expect(question.options).toHaveLength(3);
  });

  it("creates true/false questions whose candidate matches isTrue", () => {
    const questions = generateTest(
      cards,
      { questionCount: 10, answerWith: "definition", types: ["trueFalse"] },
      createRng(6),
    ) as TrueFalseQuestion[];
    expect(questions.some((q) => q.isTrue)).toBe(true);
    expect(questions.some((q) => !q.isTrue)).toBe(true);
    for (const question of questions) {
      const card = cardById.get(question.cardId)!;
      expect(question.correctAnswer).toBe(card.definition);
      expect(question.candidate === card.definition).toBe(question.isTrue);
    }
  });

  it("groups matching questions in chunks of at most 5 pairs", () => {
    const questions = generateTest(
      cards,
      { questionCount: 7, answerWith: "definition", types: ["matching"] },
      createRng(7),
    ) as MatchingQuestion[];
    expect(questions.map((q) => q.pairs.length)).toEqual([4, 3]);
    for (const question of questions) {
      expect([...question.answers.map((a) => a.cardId)].sort()).toEqual(
        [...question.pairs.map((p) => p.cardId)].sort(),
      );
    }
  });

  it("forces true/false to true when no distinct distractor exists", () => {
    const twins: Card[] = [
      { id: "a", term: "x", definition: "same" },
      { id: "b", term: "y", definition: "same" },
    ];
    const questions = generateTest(
      twins,
      { questionCount: 2, answerWith: "definition", types: ["trueFalse"] },
      createRng(8),
    ) as TrueFalseQuestion[];
    expect(questions.every((q) => q.isTrue)).toBe(true);
  });

  it("draws distractors from a separate pool when retaking only some cards", () => {
    const [wrongCard] = cards;
    const [question] = generateTest(
      [wrongCard],
      { questionCount: 1, answerWith: "definition", types: ["multipleChoice"] },
      createRng(9),
      cards,
    ) as MultipleChoiceQuestion[];
    expect(question.cardId).toBe(wrongCard.id);
    expect(question.options).toHaveLength(4);
  });

  it("returns no questions when no type is selected or the set is empty", () => {
    expect(
      generateTest(cards, { questionCount: 5, answerWith: "term", types: [] }, createRng(1)),
    ).toEqual([]);
    expect(
      generateTest([], { questionCount: 5, answerWith: "term", types: ["written"] }, createRng(1)),
    ).toEqual([]);
  });

  it("clamps the question count to the number of cards", () => {
    const questions = generateTest(
      cards.slice(0, 3),
      { questionCount: 50, answerWith: "term", types: ["written"] },
      createRng(1),
    );
    expect(questions).toHaveLength(3);
  });
});

it("separates matching pairs with repeated visible meanings without losing cards", () => {
  const twins = [
    { id: "a", term: "hello", definition: "xin chào" },
    { id: "b", term: "hi", definition: "xin chào" },
    { id: "c", term: "bye", definition: "tạm biệt" },
  ];
  const questions = generateTest(
    twins,
    { questionCount: 3, answerWith: "definition", types: ["matching"] },
    createRng(3),
  ) as MatchingQuestion[];
  expect(questions.flatMap((question) => question.pairs)).toHaveLength(3);
  for (const question of questions)
    expect(new Set(question.answers.map((answer) => answer.text)).size).toBe(
      question.answers.length,
    );
});
