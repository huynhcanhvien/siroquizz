import { describe, expect, it } from "vitest";
import {
  CREDIT_TOKENS,
  SYSTEM_ERROR_CODES,
  creditsForTokens,
  estimateGenerationCredits,
  planChunkSample,
} from "./credits";

describe("AI credits", () => {
  it("rounds spent tokens up to whole credits", () => {
    expect(creditsForTokens(0)).toBe(0);
    expect(creditsForTokens(1)).toBe(1);
    expect(creditsForTokens(CREDIT_TOKENS)).toBe(1);
    expect(creditsForTokens(CREDIT_TOKENS + 1)).toBe(2);
  });

  it("reads about eight cards per chunk and spreads them over the document", () => {
    expect(planChunkSample(12, 20)).toEqual([0, 4, 8]);
    expect(planChunkSample(2, 200)).toEqual([0, 1]);
    expect(planChunkSample(1, 5)).toEqual([0]);
  });

  it("makes cost follow the requested card count, not the document length", () => {
    const longDocument = Array.from({ length: 40 }, () => 2500);
    const few = estimateGenerationCredits(longDocument, 10);
    const many = estimateGenerationCredits(longDocument, 80);
    expect(few).toBeLessThan(10);
    expect(many).toBeGreaterThan(few * 4);
  });

  it("prices a short prompt-only request at a few credits", () => {
    expect(estimateGenerationCredits([0], 20)).toBeLessThanOrEqual(3);
  });

  it("charges every request that re-reads a chunk for more cards", () => {
    const oneChunk = estimateGenerationCredits([2500], 200);
    // 200 cards from one chunk take five requests, each sending the chunk again.
    expect(oneChunk).toBeGreaterThanOrEqual(5 * 3);
  });

  it("refunds only failures caused by the system", () => {
    expect(SYSTEM_ERROR_CODES.has("AI_PROVIDER_ERROR")).toBe(true);
    expect(SYSTEM_ERROR_CODES.has("INTERNAL")).toBe(true);
    expect(SYSTEM_ERROR_CODES.has("INVALID_FILE")).toBe(false);
    expect(SYSTEM_ERROR_CODES.has("AI_CANCELLED")).toBe(false);
    expect(SYSTEM_ERROR_CODES.has("AI_REFUSED")).toBe(false);
  });
});
