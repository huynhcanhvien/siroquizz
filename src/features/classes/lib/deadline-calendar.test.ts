import { describe, expect, it } from "vitest";
import {
  dayKey,
  deadlineStatus,
  groupDeadlines,
  monthDays,
  type DeadlineSet,
} from "./deadline-calendar";

const set = (id: string, dueAt: string | null): DeadlineSet => ({
  setId: id,
  title: id,
  cardCount: 2,
  dueAt,
  assignedAt: "2026-01-01T00:00:00Z",
});

describe("deadline calendar dates", () => {
  it("starts on Monday and pads complete weeks, including leap February", () => {
    const leap = monthDays(new Date(2024, 1, 1));
    expect(leap).toHaveLength(35);
    expect(leap.slice(0, 3)).toEqual([null, null, null]);
    expect(leap[3]?.getDate()).toBe(1);
    expect(leap[31]?.getDate()).toBe(29);
    expect(leap.slice(32)).toEqual([null, null, null]);
    expect(monthDays(new Date(2026, 1, 1)).filter(Boolean)).toHaveLength(28);
    expect(monthDays(new Date(2026, 2, 1))).toHaveLength(42);
    expect(monthDays(new Date(2024, 0, 1))[0]?.getDay()).toBe(1);
  });

  it("groups local calendar days, sorts by due time, and omits undated sets", () => {
    const late = new Date(2026, 9, 7, 23, 59);
    const early = new Date(2026, 9, 7, 0, 1);
    const next = new Date(2026, 9, 8, 0, 0);
    const groups = groupDeadlines([
      set("late", late.toISOString()),
      set("none", null),
      set("next", next.toISOString()),
      set("early", early.toISOString()),
      set("invalid", "invalid"),
    ]);
    expect([...groups.keys()].sort()).toEqual(["2026-10-07", "2026-10-08"]);
    expect(groups.get("2026-10-07")?.map((item) => item.setId)).toEqual(["early", "late"]);
    expect(dayKey(late)).toBe("2026-10-07");
  });

  it("compares exact instants at the deadline and 48-hour boundary", () => {
    const now = new Date("2026-10-07T00:00:00Z").getTime();
    expect(deadlineStatus("2026-10-06T23:59:59Z", now)).toBe("past");
    expect(deadlineStatus("2026-10-07T00:00:00Z", now)).toBe("soon");
    expect(deadlineStatus("2026-10-09T00:00:00Z", now)).toBe("soon");
    expect(deadlineStatus("2026-10-09T00:00:01Z", now)).toBe("upcoming");
  });
});
