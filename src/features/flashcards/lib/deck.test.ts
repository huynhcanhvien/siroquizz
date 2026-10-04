import { describe, expect, it } from "vitest";
import { createDeck, currentCardId, deckReducer } from "./deck";

describe("deck", () => {
  const ids = ["a", "b", "c"];

  it("starts on the first card, unflipped", () => {
    const deck = createDeck(ids);
    expect(currentCardId(deck)).toBe("a");
    expect(deck.flipped).toBe(false);
    expect(deck.finished).toBe(false);
  });

  it("flips and unflips", () => {
    const deck = deckReducer(createDeck(ids), { type: "flip" });
    expect(deck.flipped).toBe(true);
    expect(deckReducer(deck, { type: "flip" }).flipped).toBe(false);
  });

  it("moves forward and resets the flip", () => {
    const deck = deckReducer(deckReducer(createDeck(ids), { type: "flip" }), { type: "next" });
    expect(currentCardId(deck)).toBe("b");
    expect(deck.flipped).toBe(false);
  });

  it("finishes after the last card and can step back", () => {
    let deck = createDeck(ids);
    deck = deckReducer(deck, { type: "next" });
    deck = deckReducer(deck, { type: "next" });
    deck = deckReducer(deck, { type: "next" });
    expect(deck.finished).toBe(true);
    deck = deckReducer(deck, { type: "prev" });
    expect(deck.finished).toBe(false);
    expect(currentCardId(deck)).toBe("c");
  });

  it("does not go before the first card", () => {
    const deck = deckReducer(createDeck(ids), { type: "prev" });
    expect(deck.index).toBe(0);
  });

  it("marks cards and advances, moving a card between piles", () => {
    let deck = createDeck(ids);
    deck = deckReducer(deck, { type: "mark", status: "learning" });
    expect(deck.learning).toEqual(["a"]);
    expect(currentCardId(deck)).toBe("b");
    deck = deckReducer(deck, { type: "prev" });
    deck = deckReducer(deck, { type: "mark", status: "known" });
    expect(deck.known).toEqual(["a"]);
    expect(deck.learning).toEqual([]);
  });

  it("restarts with a new order", () => {
    let deck = deckReducer(createDeck(ids), { type: "mark", status: "known" });
    deck = deckReducer(deck, { type: "restart", cardIds: ["c", "a"] });
    expect(deck.order).toEqual(["c", "a"]);
    expect(deck.known).toEqual([]);
    expect(deck.index).toBe(0);
  });

  it("returns undefined current card for an empty deck", () => {
    expect(currentCardId(createDeck([]))).toBeUndefined();
  });

  it("does nothing when navigating an empty deck", () => {
    const deck = createDeck([]);
    expect(deckReducer(deck, { type: "mark", status: "known" })).toEqual(deck);
  });
});
