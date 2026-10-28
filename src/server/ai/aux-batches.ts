import { plainText } from "@/features/ai-generate/lib/output";
import { ApiError } from "../api-error";

/** Cards sent to the model in one auxiliary call: small enough that the answer never truncates. */
export const AUX_BATCH_SIZE = 40;
/** Wall-clock budget for one auxiliary request, under the 60s serverless limit. */
export const AUX_BUDGET_MS = 45_000;
/** A batch is only started when at least this much of the budget is left. */
export const AUX_MIN_BATCH_MS = 8_000;
const MAX_TOKENS = 4096;
// Reasoning (gpt-oss "low") plus JSON framing, then per-card output: a transcription is a few
// tokens, an example sentence with its translation a few dozen.
const BASE_TOKENS = 256;
const TOKENS_PER_CARD = { phonetics: 40, examples: 90 } as const;
const MAX_TEXT_LENGTH = 1000;

export type AuxCardTask = keyof typeof TOKENS_PER_CARD;
export interface AuxCard {
  id: string;
  term: string;
  definition: string;
}
export interface AuxResult {
  id: string;
  text: string;
}

/** Splits cards into consecutive batches of at most `size`. */
export function batchCards<T>(cards: readonly T[], size = AUX_BATCH_SIZE): T[][] {
  return Array.from({ length: Math.ceil(cards.length / size) }, (_, index) =>
    cards.slice(index * size, (index + 1) * size),
  );
}

/** Output budget for a batch of `count` cards. */
export const auxMaxTokens = (task: AuxCardTask, count: number): number =>
  Math.min(MAX_TOKENS, BASE_TOKENS + TOKENS_PER_CARD[task] * count);

/**
 * The model sees each card under its position ("0", "1", …) instead of its UUID, which saves
 * about 20 output tokens per card; this maps the answer back and rejects anything that does not
 * cover the batch exactly once with usable plain text.
 */
export function mapBatchOutput(
  batch: readonly AuxCard[],
  output: readonly AuxResult[],
): AuxResult[] {
  const seen = new Set<number>();
  const mapped = output.map((entry) => {
    const index = /^\d+$/.test(entry.id) ? Number(entry.id) : -1;
    const text = plainText(entry.text);
    if (!batch[index] || seen.has(index) || !text || entry.text.length > MAX_TEXT_LENGTH)
      throw new ApiError(502, "AI_INVALID_OUTPUT");
    seen.add(index);
    return { id: batch[index].id, text };
  });
  if (mapped.length !== batch.length) throw new ApiError(502, "AI_INVALID_OUTPUT");
  return mapped;
}
