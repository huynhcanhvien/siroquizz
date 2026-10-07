import type { ClassDetail } from "../schemas";

export type DeadlineSet = ClassDetail["sets"][number];
export type DeadlineStatus = "past" | "soon" | "upcoming";

/** Calendar dates use the viewer's local time, rather than the UTC ISO date. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function monthDays(month: Date): (Date | null)[] {
  const year = month.getFullYear();
  const index = month.getMonth();
  const offset = (new Date(year, index, 1).getDay() + 6) % 7;
  const count = new Date(year, index + 1, 0).getDate();
  const length = Math.ceil((offset + count) / 7) * 7;
  return Array.from({ length }, (_, i) =>
    i < offset || i >= offset + count ? null : new Date(year, index, i - offset + 1, 12),
  );
}

export function groupDeadlines(sets: DeadlineSet[]): Map<string, DeadlineSet[]> {
  const days = new Map<string, DeadlineSet[]>();
  for (const set of sets) {
    if (!set.dueAt) continue;
    const date = new Date(set.dueAt);
    if (!Number.isFinite(date.getTime())) continue;
    const key = dayKey(date);
    days.set(key, [...(days.get(key) ?? []), set]);
  }
  for (const items of days.values()) {
    items.sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime());
  }
  return days;
}

export function deadlineStatus(dueAt: string, now: number): DeadlineStatus {
  const remaining = new Date(dueAt).getTime() - now;
  return remaining < 0 ? "past" : remaining <= 48 * 60 * 60 * 1000 ? "soon" : "upcoming";
}
