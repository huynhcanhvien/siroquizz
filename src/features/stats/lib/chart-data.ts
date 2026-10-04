export interface ActivityDay {
  day: string;
  cards: number;
  minutes: number;
  goalMet: boolean;
}

export const HEAT_LEVELS = 4;

/** Ordinal intensity 0..HEAT_LEVELS relative to the busiest day; any activity is at least level 1. */
export function heatLevel(cards: number, max: number): number {
  if (cards <= 0 || max <= 0) return 0;
  return Math.min(HEAT_LEVELS, Math.max(1, Math.ceil((cards / max) * HEAT_LEVELS)));
}

/** ISO weekday of a YYYY-MM-DD day key: 0 = Monday … 6 = Sunday. */
export function weekdayIndex(day: string): number {
  return (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
}

export interface HeatmapGrid {
  /** Columns of 7 cells (Monday first); null pads days outside the range. */
  weeks: (ActivityDay | null)[][];
  /** Column index where each month starts, for axis labels. */
  months: { column: number; day: string }[];
}

export function buildHeatmap(days: readonly ActivityDay[]): HeatmapGrid {
  if (!days.length) return { weeks: [], months: [] };
  const cells: (ActivityDay | null)[] = [
    ...Array<null>(weekdayIndex(days[0].day)).fill(null),
    ...days,
  ];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const months: HeatmapGrid["months"] = [];
  weeks.forEach((week, column) => {
    const first = week.find((cell) => cell && cell.day.endsWith("-01"));
    if (first) months.push({ column, day: first.day });
  });
  return { weeks, months };
}

export function summarizeActivity(days: readonly ActivityDay[]) {
  return days.reduce(
    (sum, day) => ({
      studyDays: sum.studyDays + Number(day.cards > 0 || day.minutes > 0),
      cards: sum.cards + day.cards,
      goalDays: sum.goalDays + Number(day.goalMet),
    }),
    { studyDays: 0, cards: 0, goalDays: 0 },
  );
}

/** Smallest "nice" axis maximum (1, 2, 5 × 10ⁿ) at or above `value`. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((m) => m * magnitude >= value) ?? 10;
  return step * magnitude;
}

export function splitMinutes(total: number): { hours: number; minutes: number } {
  const rounded = Math.round(total);
  return { hours: Math.floor(rounded / 60), minutes: rounded % 60 };
}

/** This week's minutes against last week's; null when there is no previous week to compare. */
export function weekOverWeek(weekly: readonly { minutes: number }[]) {
  const current = weekly.at(-1)?.minutes ?? 0;
  const previous = weekly.at(-2)?.minutes;
  return { current, delta: previous === undefined ? null : Math.round(current - previous) };
}

/** Change over the trailing window of a cumulative series (e.g. cards learned in the last 7 days). */
export function recentGain(history: readonly { count: number }[], days = 7): number {
  const last = history.at(-1)?.count ?? 0;
  const before = history.at(-1 - days)?.count ?? history[0]?.count ?? 0;
  return Math.max(0, last - before);
}
