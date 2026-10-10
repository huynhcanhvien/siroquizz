import { describe, expect, it } from "vitest";
import {
  DAILY_FREE_CREDITS,
  MAX_JOB_CREDITS,
  SYSTEM_ERROR_CODES,
  creditsForCards,
  estimateGenerationTokens,
  jobCredits,
  planChunkSample,
} from "./credits";
import { CARD_COUNT_MAX } from "./generator";

describe("AI credits", () => {
  it("charges one credit per four cards, rounded up", () => {
    expect(creditsForCards(0)).toBe(0);
    expect(creditsForCards(1)).toBe(1);
    expect(creditsForCards(4)).toBe(1);
    expect(creditsForCards(5)).toBe(2);
    expect(creditsForCards(20)).toBe(5);
  });

  it("lets the free daily credits cover 80 cards and one request reach the card maximum", () => {
    expect(creditsForCards(80)).toBe(DAILY_FREE_CREDITS);
    expect(creditsForCards(CARD_COUNT_MAX)).toBe(MAX_JOB_CREDITS);
  });

  it("prices a job by the cards it made plus the pages the server OCR'd", () => {
    expect(jobCredits({ cards: 20 })).toBe(5);
    expect(jobCredits({ cards: 20, ocrPages: 3 })).toBe(8);
    // Partial results cost less; a result served from the cache is free.
    expect(jobCredits({ cards: 13 })).toBe(4);
    expect(jobCredits({ cards: 20, cached: true })).toBe(0);
    expect(jobCredits({ cards: 20, imported: true })).toBe(0);
    expect(jobCredits({ cards: 20, imported: true, ocrPages: 3 })).toBe(3);
  });

  it("reads about eight cards per chunk and spreads them over the document", () => {
    expect(planChunkSample(12, 20)).toEqual([0, 4, 8]);
    expect(planChunkSample(2, 200)).toEqual([0, 1]);
    expect(planChunkSample(1, 5)).toEqual([0]);
  });

  it("makes provider tokens follow the requested card count, not the document length", () => {
    const longDocument = Array.from({ length: 40 }, () => 2500);
    const few = estimateGenerationTokens(longDocument, 10);
    const many = estimateGenerationTokens(longDocument, 80);
    expect(few).toBeLessThan(10_000);
    expect(many).toBeGreaterThan(few * 4);
  });

  it("counts every request that re-reads a chunk for more cards", () => {
    // 200 cards from one chunk take five requests, each sending the chunk again.
    expect(estimateGenerationTokens([2500], 200)).toBeGreaterThanOrEqual(5 * 3000);
  });

  it("refunds only failures caused by the system", () => {
    expect(SYSTEM_ERROR_CODES.has("AI_PROVIDER_ERROR")).toBe(true);
    expect(SYSTEM_ERROR_CODES.has("INTERNAL")).toBe(true);
    expect(SYSTEM_ERROR_CODES.has("INVALID_FILE")).toBe(false);
    expect(SYSTEM_ERROR_CODES.has("AI_CANCELLED")).toBe(false);
    expect(SYSTEM_ERROR_CODES.has("AI_REFUSED")).toBe(false);
  });
});
