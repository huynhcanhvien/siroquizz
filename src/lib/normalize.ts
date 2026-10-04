// Sentence punctuation, quotes and brackets are ignored only at the edges of an answer.
// Symbols inside an answer stay meaningful ("C++" ≠ "C", "Na+" ≠ "Na").
const EDGE_CHARS = String.raw`\s.,!?;:…。，、！？；：'"“”‘’«»()（）\[\]【】「」『』`;
const EDGE_PUNCTUATION = new RegExp(`^[${EDGE_CHARS}]+|[${EDGE_CHARS}]+$`, "gu");
const WHITESPACE = /\s+/g;
const ALTERNATIVE_SEPARATOR = /[;/]/;
const COMBINING_MARKS = /\p{M}/gu;

/** Normalizes a typed answer for lenient comparison while keeping diacritics and inner symbols. */
export function normalizeAnswer(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase().replace(WHITESPACE, " ").replace(EDGE_PUNCTUATION, "");
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
