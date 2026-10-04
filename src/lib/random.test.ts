import { describe, expect, it } from "vitest";
import { createRng, pickRandom, sample, shuffle } from "./random";

describe("createRng", () => {
  it("produces the same sequence for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("produces values in [0, 1)", () => {
    const rng = createRng(7);
    for (let i = 0; i < 200; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("shuffle", () => {
  it("returns a new array with the same items and leaves the input untouched", () => {
    const input = [1, 2, 3, 4, 5, 6];
    const result = shuffle(input, createRng(1));
    expect(result).not.toBe(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...result].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("is deterministic for a seeded rng", () => {
    expect(shuffle([1, 2, 3, 4, 5], createRng(3))).toEqual(shuffle([1, 2, 3, 4, 5], createRng(3)));
  });
});

describe("sample", () => {
  it("returns at most n distinct items", () => {
    const result = sample(["a", "b", "c"], 2, createRng(9));
    expect(result).toHaveLength(2);
    expect(new Set(result).size).toBe(2);
  });

  it("returns every item when n exceeds the length", () => {
    expect(sample(["a", "b"], 5, createRng(9))).toHaveLength(2);
  });
});

describe("pickRandom", () => {
  it("returns undefined for an empty list", () => {
    expect(pickRandom([], createRng(1))).toBeUndefined();
  });

  it("returns an element of the list", () => {
    expect(["x", "y"]).toContain(pickRandom(["x", "y"], createRng(5)));
  });
});
