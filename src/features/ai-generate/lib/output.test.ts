import { describe, it, expect } from "vitest";
import { normalizeCards, splitDocument, mapConcurrent } from "./output";
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
