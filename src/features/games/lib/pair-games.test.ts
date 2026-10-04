import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/random";
import type { Card } from "@/lib/types";
import { createMatchBoard, matchReducer, PENALTY_MS } from "./match";
import { createMemoryBoard, memoryReducer } from "./memory";

const cards: Card[] = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, term: `t${i}`, definition: `d${i}` }));

describe("match game", () => {
  it("builds a shuffled board with one term and one definition tile per card", () => {
    const state = createMatchBoard(cards, createRng(1));
    expect(state.tiles).toHaveLength(12);
    const cardIds = new Set(state.tiles.map((tile) => tile.cardId));
    expect(cardIds.size).toBe(6);
    for (const id of cardIds) {
      expect(state.tiles.filter((tile) => tile.cardId === id).map((tile) => tile.side).sort()).toEqual(["definition", "term"]);
    }
  });

  it("uses every card when the set is smaller than the board", () => {
    expect(createMatchBoard(cards.slice(0, 3), createRng(1)).tiles).toHaveLength(6);
  });

  it("selects, deselects and matches a correct pair", () => {
    let state = createMatchBoard(cards.slice(0, 2), createRng(2));
    const [first] = state.tiles;
    const partner = state.tiles.find((tile) => tile.cardId === first.cardId && tile.id !== first.id)!;
    state = matchReducer(state, { type: "select", tileId: first.id });
    expect(state.selectedId).toBe(first.id);
    state = matchReducer(state, { type: "select", tileId: first.id });
    expect(state.selectedId).toBeNull();
    state = matchReducer(state, { type: "select", tileId: first.id });
    state = matchReducer(state, { type: "select", tileId: partner.id });
    expect(state.matchedIds).toEqual(expect.arrayContaining([first.id, partner.id]));
    expect(state.selectedId).toBeNull();
  });

  it("adds a penalty and flags a wrong pair, which can be cleared", () => {
    let state = createMatchBoard(cards.slice(0, 2), createRng(3));
    const [first] = state.tiles;
    const wrong = state.tiles.find((tile) => tile.cardId !== first.cardId)!;
    state = matchReducer(state, { type: "select", tileId: first.id });
    state = matchReducer(state, { type: "select", tileId: wrong.id });
    expect(state.penaltyMs).toBe(PENALTY_MS);
    expect(state.wrongIds).toEqual([first.id, wrong.id]);
    state = matchReducer(state, { type: "clearWrong" });
    expect(state.wrongIds).toEqual([]);
  });

  it("finishes when every tile is matched and ignores clicks on matched tiles", () => {
    let state = createMatchBoard(cards.slice(0, 2), createRng(4));
    for (const cardId of ["c0", "c1"]) {
      for (const tile of state.tiles.filter((item) => item.cardId === cardId)) {
        state = matchReducer(state, { type: "select", tileId: tile.id });
      }
    }
    expect(state.finished).toBe(true);
    expect(matchReducer(state, { type: "select", tileId: state.tiles[0].id })).toBe(state);
  });
});

describe("memory game", () => {
  it("creates face-down cards in pairs", () => {
    const state = createMemoryBoard(cards, createRng(1));
    expect(state.cards).toHaveLength(12);
    expect(state.flippedIds).toEqual([]);
  });

  it("keeps a matching pair face up and counts a move", () => {
    let state = createMemoryBoard(cards.slice(0, 2), createRng(5));
    const [first] = state.cards;
    const partner = state.cards.find((card) => card.cardId === first.cardId && card.id !== first.id)!;
    state = memoryReducer(state, { type: "flip", id: first.id });
    state = memoryReducer(state, { type: "flip", id: partner.id });
    expect(state.matchedIds).toEqual([first.id, partner.id]);
    expect(state.moves).toBe(1);
    expect(state.locked).toBe(false);
  });

  it("locks on a mismatch until hidden again", () => {
    let state = createMemoryBoard(cards.slice(0, 2), createRng(6));
    const [first] = state.cards;
    const other = state.cards.find((card) => card.cardId !== first.cardId)!;
    state = memoryReducer(state, { type: "flip", id: first.id });
    state = memoryReducer(state, { type: "flip", id: other.id });
    expect(state.locked).toBe(true);
    const third = state.cards.find((card) => ![first.id, other.id].includes(card.id))!;
    expect(memoryReducer(state, { type: "flip", id: third.id })).toBe(state);
    state = memoryReducer(state, { type: "hide" });
    expect(state.flippedIds).toEqual([]);
    expect(state.locked).toBe(false);
  });

  it("ignores flipping the same card twice", () => {
    let state = createMemoryBoard(cards.slice(0, 2), createRng(7));
    state = memoryReducer(state, { type: "flip", id: state.cards[0].id });
    expect(memoryReducer(state, { type: "flip", id: state.cards[0].id })).toBe(state);
  });

  it("finishes when all pairs are found", () => {
    let state = createMemoryBoard(cards.slice(0, 2), createRng(8));
    for (const cardId of ["c0", "c1"]) {
      for (const card of state.cards.filter((item) => item.cardId === cardId)) {
        state = memoryReducer(state, { type: "flip", id: card.id });
      }
    }
    expect(state.finished).toBe(true);
  });
});
