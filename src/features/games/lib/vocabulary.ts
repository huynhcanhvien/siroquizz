import { generateTest } from "@/features/test/lib/generate-test";
import type { MultipleChoiceQuestion } from "@/features/test/lib/types";
import { defaultRng, type Rng } from "@/lib/random";
import type { Card, Side } from "@/lib/types";

export const VOCABULARY_ROUNDS = 10;
export const QUIZ_SECONDS = 15;

/** Only questions with a genuine choice; direction is fixed for the entire session. */
export function createQuizQuestions(
  cards: readonly Card[],
  answerSide: Side,
  rng: Rng = defaultRng,
  pool: readonly Card[] = cards,
): MultipleChoiceQuestion[] {
  return generateTest(
    cards,
    { questionCount: cards.length, answerWith: answerSide, types: ["multipleChoice"] },
    rng,
    pool,
  )
    .filter((question): question is MultipleChoiceQuestion => question.type === "multipleChoice")
    .slice(0, VOCABULARY_ROUNDS);
}
