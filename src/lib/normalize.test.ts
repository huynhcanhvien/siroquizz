import { describe, expect, it } from "vitest";
import { foldForSearch, isAnswerMatch, normalizeAnswer } from "./normalize";

describe("normalizeAnswer", () => {
  it("trims, lowercases and collapses whitespace", () => {
    expect(normalizeAnswer("  Hello   World ")).toBe("hello world");
  });

  it("removes punctuation but keeps Vietnamese diacritics", () => {
    expect(normalizeAnswer("Xin chào!")).toBe("xin chào");
    expect(normalizeAnswer("xin chao")).not.toBe(normalizeAnswer("xin chào"));
  });

  it("normalizes composed and decomposed unicode to the same value", () => {
    const decomposed = "chào".normalize("NFD");
    expect(normalizeAnswer(decomposed)).toBe(normalizeAnswer("chào"));
  });

  it("keeps Chinese characters", () => {
    expect(normalizeAnswer("你好。")).toBe("你好");
  });

  it("keeps meaningful symbols inside the answer", () => {
    expect(normalizeAnswer("C++")).not.toBe(normalizeAnswer("C"));
    expect(normalizeAnswer("C#")).not.toBe(normalizeAnswer("C"));
    expect(normalizeAnswer("Na+")).toBe("na+");
  });

  it("only strips sentence punctuation and quotes at the edges", () => {
    expect(normalizeAnswer("“well-being”.")).toBe("well-being");
    expect(normalizeAnswer("(apple)")).toBe("apple");
  });
});

describe("isAnswerMatch", () => {
  it("accepts an exact match ignoring case and punctuation", () => {
    expect(isAnswerMatch("Apple.", "apple")).toBe(true);
  });

  it("accepts any alternative separated by ; or /", () => {
    expect(isAnswerMatch("táo", "quả táo; trái táo / táo")).toBe(true);
    expect(isAnswerMatch("trái táo", "quả táo; trái táo")).toBe(true);
  });

  it("accepts a symbol-only answer", () => {
    expect(isAnswerMatch("+", "+")).toBe(true);
  });

  it("rejects empty input", () => {
    expect(isAnswerMatch("   ", "apple")).toBe(false);
  });

  it("rejects a different answer", () => {
    expect(isAnswerMatch("pear", "apple")).toBe(false);
  });
});

describe("foldForSearch", () => {
  it("strips diacritics and đ so unaccented queries match", () => {
    expect(foldForSearch("Từ vựng Du lịch Đà Nẵng")).toBe("tu vung du lich da nang");
  });
});
