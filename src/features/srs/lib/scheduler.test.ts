import { expect, it } from "vitest";
import { createEmptyCard, fsrs, Rating } from "ts-fsrs";
import { scheduleReview, answerRating } from "./scheduler";
it("matches ts-fsrs at fixed times across midnight and repeated reviews", () => {
  const now = new Date("2026-10-04T16:59:59Z"),
    scheduler = fsrs({ request_retention: 0.9, enable_fuzz: false });
  const first = scheduleReview(null, Rating.Good, now);
  expect(first).toEqual(scheduler.next(createEmptyCard(now), now, Rating.Good).card);
  const later = new Date("2026-10-04T17:01:00Z");
  expect(scheduleReview(first, Rating.Again, later)).toEqual(
    scheduler.next(first, later, Rating.Again).card,
  );
});
it("rejects invalid ratings, retention and backwards times", () => {
  expect(() => scheduleReview(null, 0, new Date())).toThrow();
  expect(() => scheduleReview(null, 3, new Date(), 0.99)).toThrow();
  expect(() => scheduleReview(null, 3, new Date("invalid"))).toThrow();
  const card = scheduleReview(null, 3, new Date("2026-10-04"));
  expect(() => scheduleReview(card, 3, new Date("2026-10-03"))).toThrow();
});
it("maps incorrect, slow/hinted and fast correct answers", () => {
  expect(answerRating(false, 20)).toBe(1);
  expect(answerRating(true, 11000)).toBe(2);
  expect(answerRating(true, 10, true)).toBe(2);
  expect(answerRating(true, 10)).toBe(3);
});
