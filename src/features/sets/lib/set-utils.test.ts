import { describe, expect, it } from "vitest";
import type { CardProgress, StudySet } from "@/lib/types";
import { countProgress, filterAndSortSets, isBlankCardRow, moveItem, summarizeProgress, swapSides } from "./set-utils";

function makeSet(overrides: Partial<StudySet>): StudySet {
  return {
    id: "s",
    ownerId: "u",
    title: "Set",
    description: "",
    termLang: "en",
    definitionLang: "vi",
    cards: [],
    cardCount: overrides.cards?.length ?? 0,
    source: "manual",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const card = (id: string) => ({ id, term: id, definition: id });

describe("filterAndSortSets", () => {
  const sets = [
    makeSet({ id: "1", title: "Từ vựng Du lịch", updatedAt: "2026-03-01T00:00:00.000Z", cards: [card("a")] }),
    makeSet({ id: "2", title: "HSK 1", source: "ai", updatedAt: "2026-05-01T00:00:00.000Z", cards: [card("a"), card("b"), card("c")] }),
    makeSet({ id: "3", title: "Animals", source: "import", updatedAt: "2026-04-01T00:00:00.000Z", cards: [card("a"), card("b")] }),
  ];

  it("sorts by most recently updated by default", () => {
    expect(filterAndSortSets(sets, { query: "", source: "all", sort: "recent" }).map((s) => s.id)).toEqual(["2", "3", "1"]);
  });

  it("searches without accents", () => {
    expect(filterAndSortSets(sets, { query: "du lich", source: "all", sort: "recent" }).map((s) => s.id)).toEqual(["1"]);
  });

  it("filters by source", () => {
    expect(filterAndSortSets(sets, { query: "", source: "ai", sort: "recent" }).map((s) => s.id)).toEqual(["2"]);
  });

  it("sorts by card count even when a listing carries no cards", () => {
    const listed = [makeSet({ id: "few", cardCount: 3 }), makeSet({ id: "many", cardCount: 40 })];
    expect(filterAndSortSets(listed, { query: "", source: "all", sort: "cards" }).map((s) => s.id)).toEqual(["many", "few"]);
  });

  it("sorts by title and by card count", () => {
    expect(filterAndSortSets(sets, { query: "", source: "all", sort: "title" }).map((s) => s.id)).toEqual(["3", "2", "1"]);
    expect(filterAndSortSets(sets, { query: "", source: "all", sort: "cards" }).map((s) => s.id)).toEqual(["2", "3", "1"]);
  });

  it("does not mutate the input", () => {
    const copy = [...sets];
    filterAndSortSets(sets, { query: "", source: "all", sort: "title" });
    expect(sets).toEqual(copy);
  });
});

describe("swapSides", () => {
  it("swaps term and definition and clears phonetics that belonged to the old term", () => {
    expect(swapSides([{ term: "a", definition: "b", phonetic: "p" }])).toEqual([{ term: "b", definition: "a", phonetic: "" }]);
  });
});

describe("isBlankCardRow", () => {
  it("detects rows with no content", () => {
    expect(isBlankCardRow({ term: " ", definition: "", phonetic: "" })).toBe(true);
    expect(isBlankCardRow({ term: "", definition: "x", phonetic: "" })).toBe(false);
  });
});

describe("moveItem", () => {
  it("moves an item up and down", () => {
    expect(moveItem(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("returns a copy when the move is out of bounds", () => {
    const items = ["a", "b"];
    const result = moveItem(items, 0, -1);
    expect(result).toEqual(items);
    expect(result).not.toBe(items);
  });
});

describe("summarizeProgress", () => {
  const progress: CardProgress[] = [
    { userId: "u", setId: "s", cardId: "a", status: "known", updatedAt: "" },
    { userId: "u", setId: "s", cardId: "b", status: "learning", updatedAt: "" },
    { userId: "u", setId: "s", cardId: "c", status: "new", updatedAt: "" },
    { userId: "u", setId: "s", cardId: "gone", status: "known", updatedAt: "" },
  ];

  it("counts statuses only for cards that still exist", () => {
    const counts = countProgress(progress, new Set(["a", "b", "c"]));
    expect(summarizeProgress(3, counts)).toEqual({ known: 1, learning: 1, new: 1, total: 3 });
  });

  it("counts every row when no card list is given", () => {
    expect(countProgress(progress)).toEqual({ known: 2, learning: 1 });
  });

  it("builds the summary from a card count and server-side counts", () => {
    expect(summarizeProgress(10, { known: 4, learning: 2 })).toEqual({ known: 4, learning: 2, new: 4, total: 10 });
    expect(summarizeProgress(2, { known: 3, learning: 0 })).toEqual({ known: 3, learning: 0, new: 0, total: 2 });
  });
});
