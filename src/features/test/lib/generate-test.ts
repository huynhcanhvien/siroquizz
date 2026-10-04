import { normalizeAnswer } from "@/lib/normalize";
import { defaultRng, shuffle, type Rng } from "@/lib/random";
import type { Card, Side } from "@/lib/types";
import type {
  AnswerWith,
  MatchingQuestion,
  MultipleChoiceQuestion,
  Question,
  QuestionType,
  TestConfig,
  TrueFalseQuestion,
  WrittenQuestion,
} from "./types";

const MAX_OPTIONS = 4;
const MAX_MATCH_PAIRS = 5;

export function maxQuestionCount(cards: readonly Card[]): number {
  return cards.length;
}

/** Splits `count` cards across the selected types. A lone matching pair is moved elsewhere. */
export function allocateCounts(
  count: number,
  types: readonly QuestionType[],
): Partial<Record<QuestionType, number>> {
  if (types.length === 0) return {};
  const base = Math.floor(count / types.length);
  const remainder = count % types.length;
  const counts: Partial<Record<QuestionType, number>> = Object.fromEntries(
    types.map((type, index) => [type, base + (index < remainder ? 1 : 0)]),
  );
  const fallback = types.find((type) => type !== "matching");
  if (counts.matching === 1 && fallback) {
    return { ...counts, matching: 0, [fallback]: (counts[fallback] ?? 0) + 1 };
  }
  return counts;
}

const textOf = (card: Card, side: Side) => (side === "term" ? card.term : card.definition);
const otherSide = (side: Side): Side => (side === "term" ? "definition" : "term");

function pickPromptSide(answerWith: AnswerWith, rng: Rng): Side {
  if (answerWith === "term") return "definition";
  if (answerWith === "definition") return "term";
  return rng() < 0.5 ? "term" : "definition";
}

/** Texts from other cards that differ from the correct answer (compared after normalization). */
function distractors(card: Card, answerSide: Side, pool: readonly Card[], rng: Rng): string[] {
  const seen = new Set([normalizeAnswer(textOf(card, answerSide))]);
  return shuffle(pool, rng).flatMap((other) => {
    const text = textOf(other, answerSide);
    const key = normalizeAnswer(text);
    if (other.id === card.id || seen.has(key)) return [];
    seen.add(key);
    return [text];
  });
}

function buildMultipleChoice(
  id: string,
  card: Card,
  pool: readonly Card[],
  promptSide: Side,
  rng: Rng,
): MultipleChoiceQuestion {
  const answerSide = otherSide(promptSide);
  const wrong = distractors(card, answerSide, pool, rng).slice(0, MAX_OPTIONS - 1);
  const correctOptionId = `${id}-correct`;
  const options = shuffle(
    [
      { id: correctOptionId, text: textOf(card, answerSide) },
      ...wrong.map((text, index) => ({ id: `${id}-o${index}`, text })),
    ],
    rng,
  );
  return {
    id,
    type: "multipleChoice",
    cardId: card.id,
    promptSide,
    prompt: textOf(card, promptSide),
    options,
    correctOptionId,
  };
}

function buildTrueFalse(
  id: string,
  card: Card,
  pool: readonly Card[],
  promptSide: Side,
  rng: Rng,
): TrueFalseQuestion {
  const answerSide = otherSide(promptSide);
  const correctAnswer = textOf(card, answerSide);
  const [wrong] = distractors(card, answerSide, pool, rng);
  const isTrue = wrong === undefined || rng() < 0.5;
  return {
    id,
    type: "trueFalse",
    cardId: card.id,
    promptSide,
    prompt: textOf(card, promptSide),
    candidate: isTrue ? correctAnswer : wrong,
    isTrue,
    correctAnswer,
  };
}

function buildWritten(id: string, card: Card, promptSide: Side): WrittenQuestion {
  return {
    id,
    type: "written",
    cardId: card.id,
    promptSide,
    prompt: textOf(card, promptSide),
    answer: textOf(card, otherSide(promptSide)),
  };
}

function chunkSizes(total: number): number[] {
  const groups = Math.ceil(total / MAX_MATCH_PAIRS);
  const base = Math.floor(total / groups);
  return Array.from({ length: groups }, (_, index) => base + (index < total % groups ? 1 : 0));
}

function buildMatching(
  id: string,
  group: readonly Card[],
  promptSide: Side,
  rng: Rng,
): MatchingQuestion {
  const answerSide = otherSide(promptSide);
  const pairs = group.map((card) => ({
    cardId: card.id,
    prompt: textOf(card, promptSide),
    answer: textOf(card, answerSide),
  }));
  const answers = shuffle(
    pairs.map((pair) => ({ cardId: pair.cardId, text: pair.answer })),
    rng,
  );
  return { id, type: "matching", promptSide, pairs, answers };
}

function buildQuestions(
  type: QuestionType,
  chunk: readonly Card[],
  pool: readonly Card[],
  config: TestConfig,
  rng: Rng,
  nextId: () => string,
): Question[] {
  if (type === "matching") {
    let offset = 0;
    return chunkSizes(chunk.length).map((size) => {
      const group = chunk.slice(offset, offset + size);
      offset += size;
      return buildMatching(nextId(), group, pickPromptSide(config.answerWith, rng), rng);
    });
  }
  return chunk.map((card) => {
    const promptSide = pickPromptSide(config.answerWith, rng);
    if (type === "multipleChoice")
      return buildMultipleChoice(nextId(), card, pool, promptSide, rng);
    if (type === "trueFalse") return buildTrueFalse(nextId(), card, pool, promptSide, rng);
    return buildWritten(nextId(), card, promptSide);
  });
}

/**
 * Pure test builder: same cards, config and seeded rng always produce the same questions.
 * `pool` supplies distractors; pass the whole set when testing only a subset (e.g. retaking mistakes).
 */
export function generateTest(
  cards: readonly Card[],
  config: TestConfig,
  rng: Rng = defaultRng,
  pool: readonly Card[] = cards,
): Question[] {
  if (cards.length === 0 || config.types.length === 0) return [];
  const count = Math.min(Math.max(1, config.questionCount), cards.length);
  const selected = shuffle(cards, rng).slice(0, count);
  const counts = allocateCounts(count, config.types);
  let sequence = 0;
  const nextId = () => `q${(sequence += 1)}`;
  let offset = 0;

  return config.types.flatMap((type) => {
    const size = counts[type] ?? 0;
    const chunk = selected.slice(offset, offset + size);
    offset += size;
    return chunk.length > 0 ? buildQuestions(type, chunk, pool, config, rng, nextId) : [];
  });
}
