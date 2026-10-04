import { describe, expect, it } from "vitest";
import {
  buildHeatmap,
  heatLevel,
  niceMax,
  recentGain,
  splitMinutes,
  summarizeActivity,
  weekdayIndex,
  weekOverWeek,
  type ActivityDay,
} from "./chart-data";

const day = (key: string, cards = 0, minutes = 0, goalMet = false): ActivityDay => ({
  day: key,
  cards,
  minutes,
  goalMet,
});

describe("heatLevel", () => {
  it("maps activity onto four ordinal steps relative to the busiest day", () => {
    expect(heatLevel(0, 20)).toBe(0);
    expect(heatLevel(1, 20)).toBe(1);
    expect(heatLevel(10, 20)).toBe(2);
    expect(heatLevel(15, 20)).toBe(3);
    expect(heatLevel(20, 20)).toBe(4);
  });
});

describe("buildHeatmap", () => {
  it("starts columns on Monday and labels the first column and each new month", () => {
    // 2026-09-30 is a Wednesday.
    expect(weekdayIndex("2026-09-30")).toBe(2);
    const grid = buildHeatmap(
      ["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"].map(
        (key) => day(key),
      ),
    );
    expect(grid.weeks).toHaveLength(2);
    expect(grid.weeks[0].slice(0, 2)).toEqual([null, null]);
    expect(grid.weeks[0][2]?.day).toBe("2026-09-30");
    expect(grid.weeks[1][0]?.day).toBe("2026-10-05");
    expect(grid.weeks[1].slice(1)).toEqual([null, null, null, null, null, null]);
    expect(grid.months).toEqual([{ column: 0, day: "2026-10-01" }]);
  });
});

describe("summaries", () => {
  it("counts study days, cards and goal days", () => {
    expect(
      summarizeActivity([
        day("2026-10-01", 5, 3, true),
        day("2026-10-02"),
        day("2026-10-03", 0, 2),
      ]),
    ).toEqual({ studyDays: 2, cards: 5, goalDays: 1 });
  });
  it("rounds axis maxima up to 1/2/5 steps", () => {
    expect([0, 3, 12, 48, 51, 1446].map(niceMax)).toEqual([1, 5, 20, 50, 100, 2000]);
  });
  it("measures the recent gain of a cumulative series", () => {
    const history = [1, 2, 2, 4, 5, 5, 6, 9, 10].map((count) => ({ count }));
    expect(recentGain(history, 7)).toBe(8);
    expect(recentGain([{ count: 3 }], 7)).toBe(0);
  });
  it("splits minutes into hours and minutes", () => {
    expect(splitMinutes(135.4)).toEqual({ hours: 2, minutes: 15 });
  });
  it("compares this week with the previous one", () => {
    expect(weekOverWeek([{ minutes: 30 }, { minutes: 45.6 }])).toEqual({
      current: 45.6,
      delta: 16,
    });
    expect(weekOverWeek([{ minutes: 12 }])).toEqual({ current: 12, delta: null });
  });
});
