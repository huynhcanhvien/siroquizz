import type { Side } from "@/lib/types";

export const QUESTION_TYPES = ["multipleChoice", "trueFalse", "written", "matching"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export type AnswerWith = "term" | "definition" | "both";

export interface TestConfig {
  semanticGrading?: boolean;
  questionCount: number;
  answerWith: AnswerWith;
  types: QuestionType[];
}

interface QuestionBase {
  id: string;
  /** Side shown as the prompt; the learner answers with the other side. */
  promptSide: Side;
}

export interface MultipleChoiceQuestion extends QuestionBase {
  type: "multipleChoice";
  cardId: string;
  prompt: string;
  options: Array<{ id: string; text: string }>;
  correctOptionId: string;
}

export interface TrueFalseQuestion extends QuestionBase {
  type: "trueFalse";
  cardId: string;
  prompt: string;
  candidate: string;
  isTrue: boolean;
  correctAnswer: string;
}

export interface WrittenQuestion extends QuestionBase {
  type: "written";
  cardId: string;
  prompt: string;
  answer: string;
}

export interface MatchingQuestion extends QuestionBase {
  type: "matching";
  pairs: Array<{ cardId: string; prompt: string; answer: string }>;
  /** Answers in shuffled display order. */
  answers: Array<{ cardId: string; text: string }>;
}

export type Question =
  MultipleChoiceQuestion | TrueFalseQuestion | WrittenQuestion | MatchingQuestion;

export type Answer =
  | { type: "multipleChoice"; optionId: string }
  | { type: "trueFalse"; value: boolean }
  | { type: "written"; text: string; overridden?: boolean }
  | { type: "matching"; matches: Record<string, string> };

export type AnswerMap = Record<string, Answer | undefined>;

export interface QuestionResult {
  questionId: string;
  points: number;
  maxPoints: number;
  correct: boolean;
}

export interface TestGrade {
  results: QuestionResult[];
  score: number;
  total: number;
}
