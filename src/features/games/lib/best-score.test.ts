import { describe, expect, it } from "vitest";
import { bestScore, formatDuration, isNewRecord } from "./best-score";

const score = (game: "match" | "gravity" | "memory" | "scramble", value: number, timeMs: number) => ({
  id: `${game}-${value}-${timeMs}`,
  userId: "u",
  setId: "s",
  game,
  score: value,
  timeMs,
  playedAt: "",
});

describe("bestScore", () => {
  it("returns null without scores", () => {
    expect(bestScore([], "match")).toBeNull();
  });

  it("ranks timed games by fastest time", () => {
    expect(bestScore([score("match", 0, 9000), score("match", 0, 7000)], "match")?.timeMs).toBe(7000);
  });

  it("ranks score games by highest score", () => {
    expect(bestScore([score("gravity", 50, 1), score("gravity", 120, 1)], "gravity")?.score).toBe(120);
  });

  it("ignores scores from other games", () => {
    expect(bestScore([score("gravity", 50, 1)], "match")).toBeNull();
  });
});

describe("isNewRecord", () => {
  it("detects records for timed and score games", () => {
    expect(isNewRecord(null, { score: 0, timeMs: 5000 }, "match")).toBe(true);
    expect(isNewRecord(score("match", 0, 6000), { score: 0, timeMs: 5000 }, "match")).toBe(true);
    expect(isNewRecord(score("gravity", 60, 0), { score: 50, timeMs: 0 }, "gravity")).toBe(false);
  });

  it("never celebrates a zero score in score-based games", () => {
    expect(isNewRecord(null, { score: 0, timeMs: 1000 }, "gravity")).toBe(false);
  });
});

describe("formatDuration", () => {
  it("formats seconds with one decimal under a minute, m:ss otherwise", () => {
    expect(formatDuration(8450)).toBe("8.4s");
    expect(formatDuration(75_000)).toBe("1:15");
  });
});
