import { describe, expect, it } from "vitest";
import { buildSearchText, normalizeSearch, normalizeTags } from "./search";

describe("search normalisation", () => {
  it("folds Vietnamese accents, đ and case so unaccented queries match", () => {
    expect(normalizeSearch("Từ vựng DU LỊCH")).toBe("tu vung du lich");
    expect(normalizeSearch("Đường đi")).toBe("duong di");
    expect(normalizeSearch("  nhiều   khoảng\ttrắng ")).toBe("nhieu khoang trang");
  });
  it("keeps Chinese and other scripts intact", () => {
    expect(normalizeSearch("你好 Nǐ hǎo")).toBe("你好 ni hao");
  });
  it("indexes title, description, tags and cards within a size bound", () => {
    const text = buildSearchText({
      title: "Từ vựng du lịch",
      description: "Sân bay",
      tags: ["travel"],
      cards: [{ term: "你好", definition: "Xin chào" }],
    });
    expect(text).toContain("tu vung du lich");
    expect(text).toContain("san bay");
    expect(text).toContain("travel");
    expect(text).toContain("你好");
    const huge = buildSearchText({
      title: "x",
      description: "",
      tags: [],
      cards: Array.from({ length: 500 }, () => ({ term: "a".repeat(900), definition: "b" })),
    });
    expect(huge.length).toBeLessThanOrEqual(20_000);
  });
  it("cleans tags: lower-case, trimmed, unique, at most five", () => {
    expect(normalizeTags([" Travel ", "travel", "HSK 2", "", "a", "b", "c", "d"])).toEqual([
      "travel",
      "hsk 2",
      "a",
      "b",
      "c",
    ]);
  });
});
