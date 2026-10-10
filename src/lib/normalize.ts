// Sentence punctuation, quotes and brackets are ignored only at the edges of an answer.
// Symbols inside an answer stay meaningful ("C++" ≠ "C", "Na+" ≠ "Na").
const EDGE_CHARS = String.raw`\s.,!?;:…。，、！？；：'"“”‘’«»()（）\[\]【】「」『』`;
const EDGE_PUNCTUATION = new RegExp(`^[${EDGE_CHARS}]+|[${EDGE_CHARS}]+$`, "gu");
const WHITESPACE = /\s+/g;
const ALTERNATIVE_SEPARATOR = /[;/]/;
const COMBINING_MARKS = /\p{M}/gu;

/** Normalizes a typed answer for lenient comparison while keeping diacritics and inner symbols. */
export function normalizeAnswer(value: string): string {
  return value
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(WHITESPACE, " ")
    .replace(EDGE_PUNCTUATION, "");
}

export function isAnswerMatch(input: string, expected: string): boolean {
  const normalizedInput = normalizeAnswer(input);
  if (normalizedInput.length === 0) return false;
  if (normalizedInput === normalizeAnswer(expected)) return true;
  return expected
    .split(ALTERNATIVE_SEPARATOR)
    .map(normalizeAnswer)
    .some((alternative) => alternative.length > 0 && alternative === normalizedInput);
}

/** Accent-insensitive folding used for search boxes (e.g. "tu vung" matches "Từ vựng"). */
export function foldForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase()
    .replace(WHITESPACE, " ")
    .trim();
}

/** Literal spelling practice keeps punctuation and accents significant. */
export function isSpellingMatch(input: string, expected: string): boolean {
  const normalize = (text: string) =>
    text.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
  return normalize(input).length > 0 && normalize(input) === normalize(expected);
}

/** Detects overlapping explicit alternatives without guessing semantic synonyms. */
export function answersOverlap(a: string, b: string): boolean {
  const variants = (text: string) =>
    [text, ...text.split(ALTERNATIVE_SEPARATOR)].map(normalizeAnswer).filter(Boolean);
  const keys = new Set(variants(a));
  return variants(b).some((key) => keys.has(key));
}
