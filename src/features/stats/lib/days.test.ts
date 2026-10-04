import { expect, it } from "vitest";
import { dayKey, dayStart, shiftDay, computeStreak } from "./days";
it("uses each user's day across Vietnam midnight and US daylight saving", () => {
  expect(dayKey(new Date("2026-10-04T17:00:00Z"))).toBe("2026-10-05");
  expect(dayStart("2026-10-05", "Asia/Ho_Chi_Minh").toISOString()).toBe("2026-10-04T17:00:00.000Z");
  expect(dayStart("2026-03-08", "America/New_York").toISOString()).toBe("2026-03-08T05:00:00.000Z");
  expect(dayStart("2026-03-09", "America/New_York").toISOString()).toBe("2026-03-09T04:00:00.000Z");
});
it("shifts leap days and computes current/longest streak with freezes", () => {
  expect(shiftDay("2024-03-01", -1)).toBe("2024-02-29");
  expect(
    computeStreak(["2026-10-01", "2026-10-03", "2026-10-04"], "2026-10-05", ["2026-10-02"]),
  ).toEqual({ current: 4, longest: 4 });
  expect(computeStreak(["2026-10-01"], "2026-10-05")).toEqual({ current: 0, longest: 1 });
  expect(computeStreak([], "2026-10-05")).toEqual({ current: 0, longest: 0 });
});
