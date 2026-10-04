import { createEmptyCard, fsrs, Rating, type Card as FsrsCard, type Grade } from "ts-fsrs";
import { z } from "zod";
export const ratingSchema = z.number().int().min(1).max(4);
export function scheduleReview(
  previous: FsrsCard | null,
  rating: number,
  now: Date,
  retention = 0.9,
) {
  ratingSchema.parse(rating);
  z.number().min(0.7).max(0.97).parse(retention);
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid review time");
  const card = previous ?? createEmptyCard<FsrsCard>(now);
  if (card.last_review && now < card.last_review)
    throw new Error("Review time precedes previous review");
  return fsrs({ request_retention: retention, enable_fuzz: false }).next(card, now, rating as Grade)
    .card;
}
export function answerRating(correct: boolean, durationMs: number, hinted = false) {
  return !correct ? Rating.Again : hinted || durationMs > 10000 ? Rating.Hard : Rating.Good;
}
