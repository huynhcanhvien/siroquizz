import { describe, expect, it } from "vitest";
import { AUX_BATCH_SIZE, auxMaxTokens, batchCards, mapBatchOutput } from "./aux-batches";

const cards = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `id-${i}`, term: `t${i}`, definition: "" }));

describe("batchCards", () => {
  it("splits 200 cards into 5 batches of 40", () => {
    const batches = batchCards(cards(200));
    expect(batches).toHaveLength(5);
    expect(batches.every((batch) => batch.length === AUX_BATCH_SIZE)).toBe(true);
    expect(batches.flat().map((c) => c.id)).toEqual(cards(200).map((c) => c.id));
  });
  it("keeps a short final batch and returns nothing for no cards", () => {
    expect(batchCards(cards(41)).map((b) => b.length)).toEqual([40, 1]);
    expect(batchCards([])).toEqual([]);
  });
});

describe("auxMaxTokens", () => {
  it("grows with the batch and is capped", () => {
    expect(auxMaxTokens("phonetics", 1)).toBeLessThan(auxMaxTokens("phonetics", 40));
    expect(auxMaxTokens("examples", 40)).toBeGreaterThan(auxMaxTokens("phonetics", 40));
    expect(auxMaxTokens("examples", 1000)).toBe(4096);
  });
});

describe("mapBatchOutput", () => {
  const batch = cards(3);
  it("maps index ids back to card ids in model order", () => {
    expect(
      mapBatchOutput(batch, [
        { id: "2", text: "c" },
        { id: "0", text: "a" },
        { id: "1", text: "b" },
      ]),
    ).toEqual([
      { id: "id-2", text: "c" },
      { id: "id-0", text: "a" },
      { id: "id-1", text: "b" },
    ]);
  });
  it.each([
    [[{ id: "0", text: "a" }]],
    [
      [
        { id: "0", text: "a" },
        { id: "0", text: "a" },
        { id: "1", text: "b" },
      ],
    ],
    [
      [
        { id: "0", text: "a" },
        { id: "1", text: "b" },
        { id: "7", text: "c" },
      ],
    ],
    [
      [
        { id: "0", text: "a" },
        { id: "1", text: "<b></b>" },
        { id: "2", text: "c" },
      ],
    ],
    [
      [
        { id: "0", text: "a" },
        { id: "1", text: "x".repeat(1001) },
        { id: "2", text: "c" },
      ],
    ],
  ])("rejects missing, duplicate, foreign, blank or oversized output", (output) => {
    expect(() => mapBatchOutput(batch, output)).toThrow(
      expect.objectContaining({ code: "AI_INVALID_OUTPUT" }),
    );
  });
});
