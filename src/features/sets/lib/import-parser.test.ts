import { describe, expect, it } from "vitest";
import { detectSeparators, parseImportText, resolveSeparator } from "./import-parser";

describe("resolveSeparator", () => {
  it("maps presets to their characters", () => {
    expect(resolveSeparator("tab")).toBe("\t");
    expect(resolveSeparator("comma")).toBe(",");
    expect(resolveSeparator("dash")).toBe(" - ");
    expect(resolveSeparator("newline")).toBe("\n");
    expect(resolveSeparator("semicolon")).toBe(";");
  });

  it("uses custom text as-is", () => {
    expect(resolveSeparator({ custom: "=>" })).toBe("=>");
  });
});

describe("parseImportText", () => {
  it("parses tab separated lines", () => {
    const result = parseImportText("apple\tquả táo\npear\tquả lê", {
      termSeparator: "tab",
      cardSeparator: "newline",
    });
    expect(result.cards).toEqual([
      { term: "apple", definition: "quả táo" },
      { term: "pear", definition: "quả lê" },
    ]);
    expect(result.invalidLines).toEqual([]);
  });

  it("splits only on the first term separator", () => {
    const result = parseImportText("hello - xin chào - lời chào", {
      termSeparator: "dash",
      cardSeparator: "newline",
    });
    expect(result.cards).toEqual([{ term: "hello", definition: "xin chào - lời chào" }]);
  });

  it("reports invalid lines with 1-based numbers and skips blank lines", () => {
    const result = parseImportText("a,b\n\nno separator\nc,d", {
      termSeparator: "comma",
      cardSeparator: "newline",
    });
    expect(result.cards).toHaveLength(2);
    expect(result.invalidLines).toEqual([3]);
  });

  it("supports semicolon separated cards", () => {
    const result = parseImportText("一,một;二,hai", { termSeparator: "comma", cardSeparator: "semicolon" });
    expect(result.cards).toEqual([
      { term: "一", definition: "một" },
      { term: "二", definition: "hai" },
    ]);
  });

  it("parses large inputs in linear time", () => {
    const text = Array.from({ length: 60_000 }, (_, i) => `term${i}\tdef${i}`).join("\n");
    const started = performance.now();
    const result = parseImportText(text, { termSeparator: "tab", cardSeparator: "newline" });
    expect(result.cards).toHaveLength(60_000);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("handles Windows line endings", () => {
    const result = parseImportText("a\tb\r\nc\td\r\n", { termSeparator: "tab", cardSeparator: "newline" });
    expect(result.cards).toHaveLength(2);
  });
});

describe("detectSeparators", () => {
  it("prefers tab when present", () => {
    expect(detectSeparators("a\tb\nc\td")).toEqual({ termSeparator: "tab", cardSeparator: "newline" });
  });

  it("detects dash separated text", () => {
    expect(detectSeparators("apple - táo\npear - lê").termSeparator).toBe("dash");
  });

  it("detects colon separated text", () => {
    expect(detectSeparators("apple: táo\npear: lê").termSeparator).toEqual({ custom: ":" });
  });

  it("falls back to comma", () => {
    expect(detectSeparators("apple,táo").termSeparator).toBe("comma");
  });
});
