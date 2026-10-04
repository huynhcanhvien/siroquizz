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
  const parsed = generatedCardsSchema.parse(input);
  const seen = new Set<string>();
  return parsed
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
    })
    .slice(0, Math.min(limit, 200));
}
export function splitDocument(text: string, max = 25000) {
  if (!text) return [];
  const chunks: string[] = [];
  for (let start = 0; start < text.length; start += max)
    chunks.push(text.slice(start, start + max));
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
