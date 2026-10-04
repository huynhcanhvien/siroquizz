export type TermSeparatorPreset = "tab" | "comma" | "dash";
export type CardSeparatorPreset = "newline" | "semicolon";
export type CustomSeparator = { custom: string };

export type TermSeparator = TermSeparatorPreset | CustomSeparator;
export type CardSeparator = CardSeparatorPreset | CustomSeparator;

export interface ImportOptions {
  termSeparator: TermSeparator;
  cardSeparator: CardSeparator;
}

export interface ParsedPair {
  term: string;
  definition: string;
}

export interface ImportResult {
  cards: ParsedPair[];
  /** 1-based indexes of non-empty chunks that could not be parsed. */
  invalidLines: number[];
}

const PRESET_SEPARATORS: Record<TermSeparatorPreset | CardSeparatorPreset, string> = {
  tab: "\t",
  comma: ",",
  dash: " - ",
  newline: "\n",
  semicolon: ";",
};

export function resolveSeparator(separator: TermSeparator | CardSeparator): string {
  return typeof separator === "string" ? PRESET_SEPARATORS[separator] : separator.custom;
}

function splitFirst(chunk: string, separator: string): ParsedPair | null {
  if (separator.length === 0) return null;
  const index = chunk.indexOf(separator);
  if (index < 0) return null;
  const term = chunk.slice(0, index).trim();
  const definition = chunk.slice(index + separator.length).trim();
  return term && definition ? { term, definition } : null;
}

export function parseImportText(text: string, options: ImportOptions): ImportResult {
  const cardSeparator = resolveSeparator(options.cardSeparator);
  const termSeparator = resolveSeparator(options.termSeparator);
  const chunks = cardSeparator ? text.replace(/\r\n?/g, "\n").split(cardSeparator) : [text];
  // Local arrays filled with push keep large pastes linear; the result itself is new and never mutated after.
  const cards: ParsedPair[] = [];
  const invalidLines: number[] = [];
  chunks.forEach((chunk, index) => {
    if (chunk.trim() === "") return;
    const pair = splitFirst(chunk, termSeparator);
    if (pair) cards.push(pair);
    else invalidLines.push(index + 1);
  });
  return { cards, invalidLines };
}

const DETECTION_ORDER: Array<{ test: RegExp; separator: TermSeparator }> = [
  { test: /\t/, separator: "tab" },
  { test: / [-–—] /, separator: "dash" },
  { test: /[^:]:\s/, separator: { custom: ":" } },
  { test: /=/, separator: { custom: "=" } },
];

/** Guesses separators for free-form text (used by the AI mock for .txt/.md/.csv). */
export function detectSeparators(text: string): ImportOptions {
  const normalized = text.replace(/[–—]/g, "-");
  const match = DETECTION_ORDER.find(({ test }) => test.test(normalized));
  return { termSeparator: match?.separator ?? "comma", cardSeparator: "newline" };
}

/** Parses free-form text after normalizing en/em dashes, for auto-detected imports. */
export function parseAutoDetected(text: string): ImportResult {
  const normalized = text.replace(/ [–—] /g, " - ");
  return parseImportText(normalized, detectSeparators(normalized));
}
