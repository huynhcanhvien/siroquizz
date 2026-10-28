import { splitDocument } from "./output";

export const MAX_CARDS_PER_CALL = 40;
/**
 * Largest document part one merged request reads. Groq's free tier refuses any request whose
 * prompt exceeds the 8,000 tokens-per-minute quota; this leaves room for the ~1,000 tokens of
 * system prompt, schema and instructions (estimateTokens is conservative).
 */
export const MERGED_CHUNK_TOKENS = 6500;
/** Merging starts when the default chunks outnumber the requested cards by this factor. */
const MERGE_RATIO = 2;

export interface PlannedRequest {
  chunk: number;
  part: number;
  count: number;
}

/**
 * Splits a document into the parts generation requests will read. Every part is always read; a
 * long document asked for few cards is read in fewer, larger parts so it costs fewer requests
 * (each request repeats ~1,150 tokens of overhead and is throttled by the per-minute quota).
 */
export function planChunks(text: string, cardCount: number): string[] {
  if (!text) return [""];
  const chunks = splitDocument(text);
  return chunks.length > cardCount * MERGE_RATIO
    ? splitDocument(text, MERGED_CHUNK_TOKENS)
    : chunks;
}

/** Shares `total` out by weight with the largest-remainder method (even when weights are all 0). */
function apportion(weights: readonly number[], total: number): number[] {
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  const shares = weights.map((weight) =>
    sum > 0 ? (total * weight) / sum : total / weights.length,
  );
  const floors = shares.map(Math.floor);
  const leftover = total - floors.reduce((acc, value) => acc + value, 0);
  const extra = new Set(
    shares
      .map((share, index) => ({ index, fraction: share - floors[index] }))
      .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
      .slice(0, leftover)
      .map((entry) => entry.index),
  );
  return floors.map((value, index) => value + (extra.has(index) ? 1 : 0));
}

/**
 * The generation requests for chunks of the given token sizes: every chunk is read at least once
 * (one card), the rest of the cards are shared out in proportion to chunk size, and a chunk asked
 * for more than MAX_CARDS_PER_CALL is split into parts. Credit estimates and the job runner both
 * use this plan.
 */
export function planRequests(chunkTokens: readonly number[], cardCount: number): PlannedRequest[] {
  const chunks = chunkTokens.length ? chunkTokens : [0];
  const extra = apportion(chunks, Math.max(0, cardCount - chunks.length));
  return extra.flatMap((more, chunk) => {
    const count = 1 + more;
    const parts = Math.ceil(count / MAX_CARDS_PER_CALL);
    return Array.from({ length: parts }, (_, part) => ({
      chunk,
      part,
      count: Math.floor(count / parts) + (part < count % parts ? 1 : 0),
    }));
  });
}
