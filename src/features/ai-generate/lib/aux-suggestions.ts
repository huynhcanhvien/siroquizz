import { z } from "zod";
import type { HttpClient } from "@/lib/http-client";

export const auxAnswerSchema = z.object({
  cards: z.array(z.object({ id: z.string(), text: z.string() })),
  partial: z.boolean().default(false),
  remainingIds: z.array(z.string()).default([]),
  retryAfterMs: z.number().int().min(0).max(60_000).optional(),
  continuation: z.string().max(200).optional(),
});
export type AiKind = "phonetics" | "examples";
// The server answers within its time budget and returns the rest as remainingIds (500 cards ≈ 13
// batches of 40); this bounds the follow-up requests for one click.
const MAX_REQUESTS = 20;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface Suggestions {
  cards: { id: string; text: string }[];
  /** Set when a follow-up failed: the cards found before it are still returned. */
  incomplete: unknown;
}

/**
 * Asks the server for AI suggestions, then again with the remaining cards (after any throttling
 * delay it asks for) until it has answered for all of them. A failure of the first request is
 * thrown; a failure of a follow-up keeps what was already found.
 */
export async function fetchSuggestions(
  client: HttpClient,
  kind: AiKind,
  setId: string,
  onProgress: (done: number) => void,
  pause: (ms: number) => Promise<unknown> = wait,
): Promise<Suggestions> {
  let found = new Map<string, string>();
  let next: { ids: string[]; continuation?: string; delay?: number } | null = null;
  for (let attempt = 0; attempt < MAX_REQUESTS; attempt++) {
    if (next?.delay) await pause(next.delay);
    const body = next
      ? { setId, ids: next.ids, ...(next.continuation ? { continuation: next.continuation } : {}) }
      : { setId, ...(kind === "phonetics" ? { scope: "all" } : {}) };
    let data: z.infer<typeof auxAnswerSchema>;
    try {
      ({ data } = await client.request(`/api/v1/ai/${kind}`, auxAnswerSchema, {
        method: "POST",
        body,
      }));
    } catch (error) {
      if (!next) throw error;
      return { cards: toList(found), incomplete: error };
    }
    found = new Map([...found, ...data.cards.map((c): [string, string] => [c.id, c.text])]);
    onProgress(found.size);
    const remaining = data.remainingIds ?? [];
    // Stop on a complete answer, or when a follow-up made no progress.
    if (!data.partial || !remaining.length || (next && remaining.length >= next.ids.length)) break;
    next = { ids: remaining, continuation: data.continuation, delay: data.retryAfterMs };
  }
  return { cards: toList(found), incomplete: null };
}
const toList = (found: Map<string, string>) => [...found].map(([id, text]) => ({ id, text }));
