import { describe, it, expect } from "vitest";
import { normalizeCards, splitDocument, mapConcurrent, estimateTokens } from "./output";
describe("AI output validation", () => {
  it("strips markup, deduplicates normalized terms and bounds results", () => {
    let id = 0;
    expect(
      normalizeCards(
        [
          { term: "<b>Cat</b>", definition: "mèo" },
          { term: "cat", definition: "mèo" },
          { term: "Dog", definition: "<script>x</script>chó" },
        ],
        2,
        () => String(++id),
      ),
    ).toEqual([
      { id: "1", term: "Cat", definition: "mèo" },
      { id: "3", term: "Dog", definition: "xchó" },
    ]);
  });
  it("selects at most 200 cards across a pool of 2,000 vocabulary entries", () => {
    const pool = Array.from({ length: 2000 }, (_, i) => ({
      term: `word${i}`,
      definition: `meaning${i}`,
    }));
    const result = normalizeCards(pool, 200, () => "id");
    expect(result).toHaveLength(200);
    expect(result[0].term).toBe("word0");
    expect(result.at(-1)?.term).toBe("word1990");
  });
  it("rejects oversized/invalid fields rather than silently truncating", () => {
    expect(() =>
      normalizeCards(
        [
          { term: "x".repeat(1001), definition: "x" },
          { term: "y", definition: "y" },
        ],
        2,
        () => "id",
      ),
    ).toThrow();
  });
  it("splits without losing document data", () => {
    const text = "中文\n".repeat(100);
    expect(splitDocument(text, 30).join("")).toBe(text);
    expect(splitDocument("")).toEqual([]);
  });
  it("counts CJK characters as denser than Latin text", () => {
    expect(estimateTokens("中".repeat(100))).toBe(100);
    expect(estimateTokens("a".repeat(100))).toBe(40);
    expect(estimateTokens("")).toBe(0);
  });
  it("keeps every chunk within the token budget and breaks on line boundaries", () => {
    const text = Array.from({ length: 400 }, (_, i) => `từ vựng ${i} - nghĩa của từ ${i}`).join(
      "\n",
    );
    const chunks = splitDocument(text, 500);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(text);
    for (const chunk of chunks) expect(estimateTokens(chunk)).toBeLessThanOrEqual(500);
    for (const chunk of chunks.slice(0, -1)) expect(chunk.endsWith("\n")).toBe(true);
  });
  it("hard-splits a single line longer than the budget", () => {
    const text = "中".repeat(1000);
    const chunks = splitDocument(text, 300);
    expect(chunks.join("")).toBe(text);
    for (const chunk of chunks) expect(estimateTokens(chunk)).toBeLessThanOrEqual(300);
  });
  it("limits concurrent calls and retains order", async () => {
    let active = 0,
      max = 0;
    const result = await mapConcurrent([1, 2, 3, 4, 5], 3, async (n) => {
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 2;
    });
    expect(result).toEqual([2, 4, 6, 8, 10]);
    expect(max).toBe(3);
  });
});
