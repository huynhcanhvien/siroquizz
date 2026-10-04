import { IntlMessageFormat } from "intl-messageformat";
import { describe, expect, it } from "vitest";
import en from "./en.json";
import vi from "./vi.json";
import zh from "./zh.json";

type Messages = { [key: string]: string | Messages };

function flatten(messages: Messages, prefix = ""): Record<string, string> {
  return Object.entries(messages).reduce<Record<string, string>>((result, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string"
      ? { ...result, [path]: value }
      : { ...result, ...flatten(value, path) };
  }, {});
}

const locales = { vi, en, zh } as const;
const reference = flatten(vi);

describe.each(Object.entries(locales))("messages/%s.json", (locale, messages) => {
  const flat = flatten(messages as Messages);

  it("has exactly the same keys as vi.json", () => {
    expect(Object.keys(flat).sort()).toEqual(Object.keys(reference).sort());
  });

  it("has no empty strings", () => {
    expect(Object.entries(flat).filter(([, value]) => value.trim() === "")).toEqual([]);
  });

  it("only contains valid ICU messages", () => {
    for (const [key, value] of Object.entries(flat)) {
      expect(() => new IntlMessageFormat(value, locale), key).not.toThrow();
    }
  });

  it("uses the same placeholders as vi.json", () => {
    const placeholders = (text: string) =>
      [...text.matchAll(/\{(\w+)/g)].map((match) => match[1]).sort();
    for (const [key, value] of Object.entries(flat)) {
      expect(placeholders(value), key).toEqual(placeholders(reference[key]));
    }
  });
});
