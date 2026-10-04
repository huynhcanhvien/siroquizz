import { describe, expect, it } from "vitest";
import { dropBlankRows, editorSchema, setInputSchema } from "./schemas";

const baseInput = {
  title: "  Từ vựng IELTS ",
  description: "",
  termLang: "en",
  definitionLang: "vi",
  source: "manual",
  cards: [
    { term: "apple", definition: "quả táo", phonetic: "" },
    { term: "pear", definition: "quả lê", phonetic: "/peə/" },
  ],
} as const;

describe("setInputSchema", () => {
  it("accepts a valid set and trims fields", () => {
    const result = setInputSchema.safeParse(baseInput);
    expect(result.success).toBe(true);
    expect(result.data?.title).toBe("Từ vựng IELTS");
    expect(result.data?.cards[0].phonetic).toBeUndefined();
    expect(result.data?.cards[1].phonetic).toBe("/peə/");
  });

  it("requires a title", () => {
    const result = setInputSchema.safeParse({ ...baseInput, title: "   " });
    expect(result.error?.issues[0].message).toBe("titleRequired");
  });

  it("requires at least two cards", () => {
    const result = setInputSchema.safeParse({ ...baseInput, cards: [baseInput.cards[0]] });
    expect(result.error?.issues[0].message).toBe("minCards");
  });

  it("flags a card missing its definition", () => {
    const result = setInputSchema.safeParse({
      ...baseInput,
      cards: [...baseInput.cards, { term: "plum", definition: " " }],
    });
    expect(result.error?.issues[0]).toMatchObject({
      message: "cardDefinitionRequired",
      path: ["cards", 2, "definition"],
    });
  });

  it("rejects unknown languages", () => {
    expect(setInputSchema.safeParse({ ...baseInput, termLang: "xx" }).success).toBe(false);
  });
});

describe("dropBlankRows", () => {
  it("removes rows where every field is empty", () => {
    const rows = [
      { term: "a", definition: "b" },
      { term: " ", definition: "" },
      { term: "", definition: "", phonetic: "x" },
    ];
    expect(dropBlankRows(rows)).toEqual([rows[0], rows[2]]);
  });
});

describe("editorSchema", () => {
  const base = { title: "T", description: "", termLang: "en", definitionLang: "vi" } as const;
  const row = (term: string, definition: string) => ({ term, definition, phonetic: "" });

  it("ignores fully blank rows when counting cards", () => {
    const result = editorSchema.safeParse({ ...base, cards: [row("a", "b"), row("", ""), row("c", "d")] });
    expect(result.success).toBe(true);
  });

  it("flags partially filled rows at the right index", () => {
    const result = editorSchema.safeParse({ ...base, cards: [row("a", "b"), row("", ""), row("c", "")] });
    expect(result.error?.issues[0]).toMatchObject({ path: ["cards", 2, "definition"], message: "cardDefinitionRequired" });
  });

  it("requires two non-blank rows", () => {
    const result = editorSchema.safeParse({ ...base, cards: [row("a", "b"), row("", "")] });
    expect(result.error?.issues[0]).toMatchObject({ path: ["cards"], message: "minCards" });
  });

  it("flags overly long fields", () => {
    const result = editorSchema.safeParse({ ...base, cards: [row("a".repeat(1001), "b"), row("c", "d")] });
    expect(result.error?.issues[0]).toMatchObject({ path: ["cards", 0, "term"], message: "fieldTooLong" });
  });
});
