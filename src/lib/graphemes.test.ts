import { describe, expect, it } from "vitest";
import { splitGraphemes } from "./graphemes";

describe("splitGraphemes", () => {
  it("keeps Vietnamese letters with stacked diacritics as one unit", () => {
    const decomposed = "việt".normalize("NFD");
    expect(splitGraphemes(decomposed)).toHaveLength(4);
  });

  it("splits Chinese text into characters", () => {
    expect(splitGraphemes("你好")).toEqual(["你", "好"]);
  });

  it("returns an empty list for an empty string", () => {
    expect(splitGraphemes("")).toEqual([]);
  });
});
