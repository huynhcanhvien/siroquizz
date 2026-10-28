import { describe, expect, it } from "vitest";
import type { Card, StudySet } from "@/lib/types";
import { applyOps, diffCards, diffSet } from "./card-diff";

const card = (id: string, term = id, extra: Partial<Card> = {}): Card => ({
  id,
  term,
  definition: `${term} meaning`,
  ...extra,
});
const before = [card("a"), card("b", "b", { phonetic: "/b/" }), card("c")];
let next = 0;
const newId = () => `new-${++next}`;
const strip = (
  cards: { term: string; definition: string; phonetic?: string; example?: string }[],
) =>
  cards
    .map(({ term, definition, phonetic, example }) => ({ term, definition, phonetic, example }))
    .toSorted((x, y) => x.term.localeCompare(y.term));

describe("diffCards", () => {
  it("returns no ops when nothing changed, ignoring order and blank optional fields", () => {
    const after = [{ ...before[2], example: "" }, before[1], { ...before[0], phonetic: undefined }];
    expect(diffCards(before, after)).toEqual([]);
  });

  it("turns a changed field into an edit", () => {
    const after = [before[0], { ...before[1], definition: "bee" }, before[2]];
    expect(diffCards(before, after)).toEqual([
      { op: "edit", cardId: "b", card: { term: "b", definition: "bee", phonetic: "/b/" } },
    ]);
  });

  it("deletes cards that disappeared", () => {
    expect(diffCards(before, [before[0], before[2]])).toEqual([{ op: "delete", cardId: "b" }]);
  });

  it("adds cards without an id or with an unknown id", () => {
    const after = [
      ...before,
      { term: "d", definition: "dee" },
      { id: "zzz", term: "e", definition: "ee" },
    ];
    expect(diffCards(before, after)).toEqual([
      { op: "add", card: { term: "d", definition: "dee" } },
      { op: "add", card: { term: "e", definition: "ee" } },
    ]);
  });

  it("treats a repeated id as a new card", () => {
    const after = [...before, { ...before[0], term: "copy" }];
    expect(diffCards(before, after)).toEqual([
      { op: "add", card: { term: "copy", definition: "a meaning" } },
    ]);
  });

  it("trims what people typed", () => {
    expect(diffCards([card("a")], [{ id: "a", term: " a ", definition: "a meaning " }])).toEqual(
      [],
    );
  });
});

describe("applyOps", () => {
  it("applies edits in place, drops deletions and appends additions", () => {
    const result = applyOps(
      before,
      [
        { op: "add", card: { term: "d", definition: "dee" } },
        { op: "edit", cardId: "a", card: { term: "A", definition: "big a" } },
        { op: "delete", cardId: "c" },
      ],
      newId,
    );
    expect(result.map((c) => c.id)).toEqual(["a", "b", "new-1"]);
    expect(result[0]).toEqual({ id: "a", term: "A", definition: "big a" });
    expect(result[1]).toEqual(before[1]);
  });

  it("skips edits and deletions of cards that no longer exist", () => {
    const result = applyOps(
      before,
      [
        { op: "edit", cardId: "gone", card: { term: "x", definition: "x" } },
        { op: "delete", cardId: "gone" },
      ],
      newId,
    );
    expect(result).toEqual(before);
  });

  it("reproduces the edited deck from its diff, apart from ids and order", () => {
    const after = [
      { ...before[2], definition: "changed" },
      { term: "new one", definition: "fresh", example: "An example." },
      before[0],
    ];
    expect(strip(applyOps(before, diffCards(before, after), newId))).toEqual(strip(after));
  });

  it("does not mutate its input", () => {
    const copy = structuredClone(before);
    applyOps(before, [{ op: "edit", cardId: "a", card: { term: "z", definition: "z" } }], newId);
    expect(before).toEqual(copy);
  });
});

describe("diffSet", () => {
  const set = {
    id: "s",
    ownerId: "o",
    title: "Animals",
    description: "Zoo",
    termLang: "en",
    definitionLang: "vi",
    cards: before,
    cardCount: 3,
    source: "manual",
    createdAt: "",
    updatedAt: "",
  } satisfies StudySet;

  it("includes the title and description only when they changed", () => {
    expect(diffSet(set, { title: " Animals ", description: "Zoo", cards: before })).toEqual({
      cards: [],
    });
    expect(diffSet(set, { title: "Pets", description: "Home", cards: before })).toEqual({
      title: "Pets",
      description: "Home",
      cards: [],
    });
  });

  it("carries the card ops", () => {
    expect(
      diffSet(set, { title: "Animals", description: "Zoo", cards: before.slice(1) }).cards,
    ).toEqual([{ op: "delete", cardId: "a" }]);
  });
});
