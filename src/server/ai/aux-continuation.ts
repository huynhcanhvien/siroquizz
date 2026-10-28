import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "../env";

/** A click's follow-up requests stay free for this long after the first one. */
const CONTINUATION_TTL_MS = 15 * 60_000;
/** Follow-ups one click may make (500 cards need at most 13 batches). */
const MAX_CONTINUATIONS = 20;

const sign = (payload: string) =>
  createHmac("sha256", getServerEnv().BETTER_AUTH_SECRET!).update(payload).digest("base64url");
const payloadOf = (userId: string, task: string, started: number, count: number, work: string) =>
  `aux:${userId}:${task}:${started}:${count}:${work}`;

/**
 * Fingerprint of the cards a follow-up may work on (ids and text, in order). A continuation is
 * only valid for exactly the cards left over by the request that issued it, so it cannot be
 * replayed to get free work on other cards or other sets.
 */
export function workDigest(cards: readonly { id: string; term: string; definition: string }[]) {
  const hash = createHash("sha256");
  for (const card of cards) hash.update(JSON.stringify([card.id, card.term, card.definition]));
  return hash.digest("base64url");
}

/**
 * Proof that a follow-up request continues a click the user was already charged for. It carries
 * when that click started and how many follow-ups it made, so it cannot be reused for ever.
 */
export function issueContinuation(
  userId: string,
  task: string,
  started: number,
  count: number,
  work: string,
) {
  if (count >= MAX_CONTINUATIONS) return undefined;
  return `${started}.${count}.${sign(payloadOf(userId, task, started, count, work))}`;
}

/**
 * The click a continuation belongs to, or null when it is forged, expired, used up or presented
 * for other cards than the ones it was issued for (`work`, see workDigest).
 */
export function readContinuation(
  token: string,
  userId: string,
  task: string,
  work: string,
  now = Date.now(),
): { started: number; count: number } | null {
  const [startedText, countText, signature] = token.split(".");
  const started = Number(startedText),
    count = Number(countText);
  if (!signature || !Number.isSafeInteger(started) || !Number.isSafeInteger(count)) return null;
  const expected = Buffer.from(sign(payloadOf(userId, task, started, count, work)));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  if (now - started > CONTINUATION_TTL_MS || count >= MAX_CONTINUATIONS) return null;
  return { started, count };
}
