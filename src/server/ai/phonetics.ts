import "server-only";
import { addDict, convert, pinyin } from "pinyin-pro";
import ModernChineseDict from "@pinyin-pro/data/modern";

// Imported only by server AI tasks: do not ship the dictionary to the browser.
addDict(ModernChineseDict);

function chineseReadings(term: string, language: string) {
  const text = term.normalize("NFC").trim();
  // Mixed scripts and unknown characters need contextual transcription by the model.
  if (language !== "zh" || !/^[\p{Script=Han}\s\p{P}]+$/u.test(text)) return null;
  const readings = pinyin(text, { type: "all", toneType: "symbol", toneSandhi: false });
  if (readings.some((entry) => !entry.isZh && /\p{Script=Han}/u.test(entry.origin))) return null;
  const syllables = readings.filter((entry) => entry.isZh);
  return syllables.length ? syllables : null;
}

/** Dictionary guidance, not an assertion that a polyphonic term has only one reading. */
export function phoneticReference(term: string, language: string) {
  const readings = chineseReadings(term, language);
  if (!readings) return undefined;
  return {
    citation: readings.map((entry) => entry.pinyin).join(" "),
    readings: readings.map((entry) => ({ character: entry.origin, allowed: entry.polyphonic })),
  };
}

/** Correct impossible syllables/tones without overriding valid context-dependent readings. */
export function verifyPhonetic(term: string, language: string, output: string) {
  const text = output.normalize("NFC").trim();
  const readings = chineseReadings(term, language);
  if (!readings) return text;
  const tokens = convert(
    text
      .toLowerCase()
      .replace(/[\/\[\]()]/g, "")
      .trim()
      .split(/[\s'’\-]+/),
    { format: "numToSymbol" },
  );
  const citation = readings.map((entry) => entry.pinyin).join(" ");
  if (tokens.length !== readings.length) return citation;
  return tokens
    .map((token, index) => {
      const entry = readings[index];
      return entry.polyphonic.includes(token) || token === entry.pinyin ? token : entry.pinyin;
    })
    .join(" ");
}
