const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

/** Splits text into user-perceived characters (handles Vietnamese diacritics and CJK). */
export function splitGraphemes(value: string): string[] {
  if (!segmenter) return Array.from(value.normalize("NFC"));
  return Array.from(segmenter.segment(value), (segment) => segment.segment);
}
