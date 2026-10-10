import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/random";
import { isSpellingMatch } from "@/lib/normalize";
import { createQuizQuestions } from "./vocabulary";
import { uniquePairCards, createMatchBoard, matchReducer } from "./match";
import { replayMatch } from "./replay";
import type { Card } from "@/lib/types";
const cards: Card[] = [
  { id: "a", term: "hello", definition: "xin chào" },
  { id: "b", term: "hi", definition: "Xin chào!" },
  { id: "c", term: "bye", definition: "tạm biệt" },
];
describe("unambiguous vocabulary games", () => {
  it("omits duplicate visible terms or meanings from a pair board", () => {
    expect(uniquePairCards(cards).map((card) => card.id)).toEqual(["a", "c"]);
    expect(
      uniquePairCards([
        ...cards,
        { id: "d", term: "goodbye", definition: "tạm biệt / chào tạm biệt" },
      ]),
    ).toHaveLength(2);
  });
  it("replays a board with duplicate meanings using the same server seed", () => {
    let state = createMatchBoard(cards, createRng(1));
    const events: { t: number; tileId: string }[] = [];
    for (const [i, id] of [...new Set(state.tiles.map((tile) => tile.cardId))].entries()) {
      for (const tile of state.tiles.filter((tile) => tile.cardId === id)) {
        events.push({ t: 500 * (i + 1), tileId: tile.id });
        state = matchReducer(state, { type: "select", tileId: tile.id });
      }
    }
    expect(state.finished).toBe(true);
    expect(replayMatch(cards, 1, events, 2000)).toMatchObject({ verified: true, score: 2 });
  });
  it("keeps direction fixed and never produces a one-option quiz", () => {
    const questions = createQuizQuestions(cards, "term", createRng(4));
    expect(questions.length).toBeGreaterThan(0);
    expect(
      questions.every(
        (question) => question.promptSide === "definition" && question.options.length > 1,
      ),
    ).toBe(true);
    const question = questions.find((question) => question.cardId === "a")!;
    // 'hi' is a valid translation of the same prompt, so it must not be marked as a distractor.
    expect(question.options.map((option) => option.text)).not.toContain("hi");
  });
  it("retakes only missed prompts while keeping distractors from the full deck", () => {
    const questions = createQuizQuestions([cards[2]], "definition", createRng(5), cards);
    expect(questions).toHaveLength(1);
    expect(questions[0].cardId).toBe("c");
    expect(questions[0].options.length).toBeGreaterThan(1);
  });
  it("cannot create a quiz when all answers are indistinguishable", () => {
    expect(createQuizQuestions(cards.slice(0, 2), "definition")).toEqual([]);
  });
  it("keeps accents, characters and punctuation significant in spelling mode", () => {
    expect(isSpellingMatch(" XIN CHÀO ".normalize("NFD"), "xin chào")).toBe(true);
    expect(isSpellingMatch("xin chao", "xin chào")).toBe(false);
    expect(isSpellingMatch("你好", "你好")).toBe(true);
    expect(isSpellingMatch("你好。", "你好")).toBe(false);
    expect(isSpellingMatch("apple", "apple / pear")).toBe(false);
  });
});
