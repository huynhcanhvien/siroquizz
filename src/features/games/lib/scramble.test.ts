import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/random";
import type { Card } from "@/lib/types";
import { createScrambleRound, scrambleReducer, scrambleUnits, splitUnits, roundPoints } from "./scramble";

const card = (term: string): Card => ({ id: term, term, definition: `def of ${term}` });

describe("splitUnits", () => {
  it("splits a single word into graphemes", () => {
    expect(splitUnits("việt".normalize("NFD"))).toHaveLength(4);
  });

  it("splits a phrase into words", () => {
    expect(splitUnits("  book a  room ")).toEqual(["book", "a", "room"]);
  });

  it("splits Chinese into characters", () => {
    expect(splitUnits("中国")).toEqual(["中", "国"]);
  });
});

describe("scrambleUnits", () => {
  it("never returns the original order when a different order exists", () => {
    for (let seed = 1; seed < 30; seed += 1) {
      expect(scrambleUnits(["a", "b"], createRng(seed)).join("")).toBe("ba");
    }
  });

  it("keeps the same units", () => {
    expect([...scrambleUnits(["c", "a", "t", "s"], createRng(4))].sort()).toEqual(["a", "c", "s", "t"]);
  });

  it("returns identical units unchanged", () => {
    expect(scrambleUnits(["a", "a"], createRng(1))).toEqual(["a", "a"]);
  });
});

describe("scramble round", () => {
  it("solves a word by picking tiles in order", () => {
    let round = createScrambleRound(card("cat"), createRng(2));
    for (const letter of ["c", "a", "t"]) {
      const tile = round.pool.find((item) => item.text === letter && !round.answer.includes(item.id))!;
      round = scrambleReducer(round, { type: "pick", tileId: tile.id });
    }
    expect(round.status).toBe("correct");
  });

  it("accepts any tile with the right text when letters repeat", () => {
    let round = createScrambleRound(card("aab"), createRng(3));
    const order = ["a", "a", "b"];
    for (const letter of order) {
      const tile = round.pool.find((item) => item.text === letter && !round.answer.includes(item.id))!;
      round = scrambleReducer(round, { type: "pick", tileId: tile.id });
    }
    expect(round.status).toBe("correct");
  });

  it("marks a full wrong answer and lets the player unpick", () => {
    let round = createScrambleRound(card("ab"), createRng(5));
    const b = round.pool.find((item) => item.text === "b")!;
    const a = round.pool.find((item) => item.text === "a")!;
    round = scrambleReducer(round, { type: "pick", tileId: b.id });
    round = scrambleReducer(round, { type: "pick", tileId: a.id });
    expect(round.status).toBe("wrong");
    round = scrambleReducer(round, { type: "unpick", tileId: b.id });
    expect(round.answer).toEqual([a.id]);
    expect(round.status).toBe("playing");
  });

  it("hint fixes the correct prefix and adds the next tile", () => {
    let round = createScrambleRound(card("dog"), createRng(6));
    const g = round.pool.find((item) => item.text === "g")!;
    round = scrambleReducer(round, { type: "pick", tileId: g.id });
    round = scrambleReducer(round, { type: "hint" });
    expect(round.answer.map((id) => round.pool.find((item) => item.id === id)!.text)).toEqual(["d"]);
    expect(round.hintsUsed).toBe(1);
  });

  it("clears the answer", () => {
    let round = createScrambleRound(card("dog"), createRng(7));
    round = scrambleReducer(round, { type: "pick", tileId: round.pool[0].id });
    round = scrambleReducer(round, { type: "clear" });
    expect(round.answer).toEqual([]);
  });

  it("ignores input after the round is solved", () => {
    let round = createScrambleRound(card("ab"), createRng(8));
    for (const letter of ["a", "b"]) {
      const tile = round.pool.find((item) => item.text === letter)!;
      round = scrambleReducer(round, { type: "pick", tileId: tile.id });
    }
    expect(scrambleReducer(round, { type: "hint" })).toBe(round);
  });

  it("scores rounds with a hint penalty and a floor", () => {
    expect(roundPoints(0)).toBe(10);
    expect(roundPoints(2)).toBe(4);
    expect(roundPoints(9)).toBe(1);
  });
});
