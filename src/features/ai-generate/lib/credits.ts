/**
 * AI credit accounting shared by the server (charging) and the browser (live estimates while the
 * user adjusts a request). People pay for what they get: the cards a generation produces, plus
 * pages the server had to read with the AI. Reading in the browser (text and OCR) is free.
 * Provider tokens are tracked separately, for the app-wide daily cap on the shared key.
 */
export const CARDS_PER_CREDIT = 4;
export const DAILY_FREE_CREDITS = 20;
/** Requests at or under this price, covered by today's free credits, run without asking. */
export const AUTO_CONFIRM_CREDITS = 5;
/** The largest request: CARD_COUNT_MAX (200) cards. */
export const MAX_JOB_CREDITS = 50;
/** Pages the server may OCR for one request (when the browser could not read them). */
export const MAX_OCR_PAGES = 10;
export const OCR_CREDITS_PER_PAGE = 1;
/** Provider tokens one server OCR page uses (~1,900 for the image plus its transcript). */
export const OCR_TOKENS_PER_PAGE = 3000;
// Measured on gpt-oss: system prompt + JSON schema + instructions per request, and the answer.
const REQUEST_OVERHEAD_TOKENS = 1000;
const REASONING_TOKENS = 150;
const OUTPUT_TOKENS_PER_CARD = 50;
const AVOID_TERM_TOKENS = 4;
export const MAX_CARDS_PER_CALL = 40;
/** A chunk (~2,500 tokens) comfortably yields this many distinct cards. */
const CARDS_PER_CHUNK = 8;

/** Failures that are the service's fault; their credits are refunded. */
export const SYSTEM_ERROR_CODES: ReadonlySet<string> = new Set([
  "AI_PROVIDER_ERROR",
  "AI_INVALID_OUTPUT",
  "AI_OUTPUT_TRUNCATED",
  "AI_INPUT_TOO_LARGE",
  "AI_TIMEOUT",
  "AI_UNAVAILABLE",
  "RATE_LIMITED",
  "STORAGE_UNAVAILABLE",
  "INTERNAL",
]);

/** The price of `cards` generated cards. */
export const creditsForCards = (cards: number): number =>
  Math.ceil(Math.max(0, cards) / CARDS_PER_CREDIT);

/**
 * What a job costs: pages the server OCR'd plus the cards it produced. A result served from the
 * cache cost the service nothing, so it is free.
 */
export const jobCredits = (job: { ocrPages?: number; cards: number; cached?: boolean }): number =>
  (job.ocrPages ?? 0) * OCR_CREDITS_PER_PAGE + (job.cached ? 0 : creditsForCards(job.cards));

/**
 * Chooses which chunks to read for `cardCount` cards: about one chunk per CARDS_PER_CHUNK cards,
 * evenly spaced so the set covers the whole document. Cost then follows the cards requested
 * rather than the document's length.
 */
export function planChunkSample(chunkCount: number, cardCount: number): number[] {
  const used = Math.max(1, Math.min(chunkCount, Math.ceil(cardCount / CARDS_PER_CHUNK)));
  return Array.from({ length: used }, (_, i) => Math.floor((i * chunkCount) / used));
}

export interface PlannedRequest {
  chunk: number;
  part: number;
  count: number;
}
/** Splits the cards over the sampled chunks, at most MAX_CARDS_PER_CALL per request. */
export function planRequests(chunkCount: number, cardCount: number): PlannedRequest[] {
  const chunks = planChunkSample(chunkCount, cardCount);
  const perChunk = Math.ceil(cardCount / chunks.length);
  const parts = Math.ceil(perChunk / MAX_CARDS_PER_CALL);
  return chunks.flatMap((chunk) =>
    Array.from({ length: parts }, (_, part) => ({
      chunk,
      part,
      count: Math.ceil(perChunk / parts),
    })),
  );
}

/**
 * Upper-end provider tokens for generating `cardCount` cards from chunks of the given sizes; held
 * against the app-wide daily cap while the job runs.
 */
export function estimateGenerationTokens(chunkTokens: readonly number[], cardCount: number) {
  let produced = 0;
  const tokens = planRequests(chunkTokens.length, cardCount).reduce((total, request) => {
    // Later parts of a chunk also send the terms created so far, so they are not repeated.
    const avoid = request.part > 0 ? produced * AVOID_TERM_TOKENS : 0;
    produced += request.count;
    return (
      total +
      chunkTokens[request.chunk] +
      REQUEST_OVERHEAD_TOKENS +
      REASONING_TOKENS +
      avoid +
      request.count * OUTPUT_TOKENS_PER_CARD
    );
  }, 0);
  return tokens;
}
