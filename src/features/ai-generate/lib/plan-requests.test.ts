import { describe, expect, it } from "vitest";
import { estimateTokens, splitDocument } from "./output";
import { MERGED_CHUNK_TOKENS, planChunks, planRequests } from "./plan-requests";

const total = (requests: { count: number }[]) => requests.reduce((sum, r) => sum + r.count, 0);
/** About `tokens` estimated tokens of Latin text in 80-character lines. */
const documentOf = (tokens: number) =>
  Array.from({ length: Math.ceil((tokens * 2.5) / 81) }, (_, i) =>
    `line ${i} `.padEnd(80, "x"),
  ).join("\n");

describe("planChunks", () => {
  it("merges a long document into far fewer, larger requests when few cards are wanted", () => {
    const text = documentOf(100_000);
    expect(splitDocument(text).length).toBeGreaterThanOrEqual(40);
    const chunks = planChunks(text, 10);
    // Each request still reads its whole part, so every passage is covered once.
    expect(chunks.join("")).toBe(text);
    expect(chunks.length).toBeLessThanOrEqual(16);
    expect(Math.max(...chunks.map(estimateTokens))).toBeLessThanOrEqual(MERGED_CHUNK_TOKENS);
    const requests = planRequests(chunks.map(estimateTokens), 10);
    expect(requests.length).toBeLessThan(40 / 2);
  });
  it("keeps small chunks when the card count is large enough to use them", () => {
    const text = documentOf(7_000);
    expect(planChunks(text, 50)).toEqual(splitDocument(text));
    expect(planChunks(text, 50)).toHaveLength(3);
  });
  it("keeps an empty prompt-only document as one empty chunk", () => {
    expect(planChunks("", 10)).toEqual([""]);
  });
});

describe("planRequests", () => {
  it("asks for exactly the requested cards, one request per chunk", () => {
    const requests = planRequests([2500, 2500, 2500], 50);
    expect(requests).toHaveLength(3);
    expect(total(requests)).toBe(50);
  });
  it("shares cards out in proportion to each chunk's size", () => {
    const requests = planRequests([6000, 2000], 20);
    expect(requests.map((r) => r.count)).toEqual([15, 5]);
  });
  it("still reads every chunk when there are more chunks than cards", () => {
    const requests = planRequests(
      Array.from({ length: 12 }, () => 100),
      5,
    );
    expect(requests.map((r) => [r.chunk, r.count])).toEqual(
      Array.from({ length: 12 }, (_, i) => [i, 1]),
    );
  });
  it("splits a chunk into parts of at most 40 cards", () => {
    const requests = planRequests([2500], 200);
    expect(requests.map((r) => [r.chunk, r.part, r.count])).toEqual([
      [0, 0, 40],
      [0, 1, 40],
      [0, 2, 40],
      [0, 3, 40],
      [0, 4, 40],
    ]);
    expect(total(planRequests([2500, 10, 900], 200))).toBe(200);
  });
  it("spreads cards evenly when no chunk has text", () => {
    expect(planRequests([0], 10)).toEqual([{ chunk: 0, part: 0, count: 10 }]);
    expect(planRequests([0, 0], 5).map((r) => r.count)).toEqual([3, 2]);
  });
});
