import { generatedCardsSchema } from "../schemas";
import type { GeneratedCard } from "./generator";
export const plainText = (value: string) =>
  value
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim();
export function normalizeCards(
  input: unknown,
  limit: number,
  makeId: () => string,
): GeneratedCard[] {
  const parsed = generatedCardsSchema.element.array().min(2).parse(input);
  const seen = new Set<string>();
  const cards = parsed
    .map((card) => ({
      id: makeId(),
      term: plainText(card.term),
      definition: plainText(card.definition),
      ...(card.phonetic ? { phonetic: plainText(card.phonetic) } : {}),
    }))
    .filter((card) => {
      const key = card.term.normalize("NFKC").toLocaleLowerCase();
      if (!card.term || !card.definition || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const count = Math.min(limit, 200, cards.length);
  return Array.from(
    { length: count },
    (_, index) => cards[Math.floor((index * cards.length) / count)],
  );
}
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uf900-\ufaff]/;
const LATIN_CHARS_PER_TOKEN = 2.5;
/**
 * Conservative token estimate: CJK text costs about one token per character, Vietnamese and other
 * Latin-script text roughly 2.5 characters per token (measured against gpt-oss).
 */
export function estimateTokens(text: string): number {
  let cjk = 0,
    other = 0;
  for (const char of text) {
    if (CJK.test(char)) cjk++;
    else other++;
  }
  return cjk + Math.ceil(other / LATIN_CHARS_PER_TOKEN);
}
/** Splits one over-long line into pieces that each fit the budget. */
function hardSplit(line: string, maxTokens: number): string[] {
  const pieces: string[] = [];
  let piece = "",
    weight = 0;
  for (const char of line) {
    const cost = CJK.test(char) ? 1 : 1 / LATIN_CHARS_PER_TOKEN;
    if (weight + cost > maxTokens && piece) {
      pieces.push(piece);
      piece = "";
      weight = 0;
    }
    piece += char;
    weight += cost;
  }
  if (piece) pieces.push(piece);
  return pieces;
}
// Free-tier Groq allows 8,000 tokens per minute and model; a chunk plus its answer must fit.
export const CHUNK_TOKENS = 2500;
/** Splits a document on line boundaries into chunks of at most `maxTokens` estimated tokens. */
export function splitDocument(text: string, maxTokens = CHUNK_TOKENS): string[] {
  const chunks: string[] = [];
  let current = "",
    currentTokens = 0;
  const flush = () => {
    if (current) chunks.push(current);
    current = "";
    currentTokens = 0;
  };
  for (const line of text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const tokens = estimateTokens(line);
    if (tokens > maxTokens) {
      flush();
      chunks.push(...hardSplit(line, maxTokens));
      continue;
    }
    if (currentTokens + tokens > maxTokens) flush();
    current += line;
    currentTokens += tokens;
  }
  flush();
  return chunks;
}
/** Bounds concurrency, propagates cancellation and preserves input order. */
export async function mapConcurrent<T, U>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  const output: U[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        output[index] = await fn(items[index], index);
      }
    }),
  );
  return output;
}
