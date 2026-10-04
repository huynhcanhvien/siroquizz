export function dayKey(date: Date, timeZone = "Asia/Ho_Chi_Minh") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
export function shiftDay(day: string, delta: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}
export function dayStart(day: string, timeZone: string) {
  const target = new Date(`${day}T00:00:00Z`).getTime();
  let guess = target;
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 4; i++) {
    const p = format.formatToParts(new Date(guess)),
      get = (type: string) => Number(p.find((v) => v.type === type)!.value);
    const represented = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second"),
    );
    const correction = target - represented;
    if (!correction) break;
    guess += correction;
  }
  return new Date(guess);
}
export function computeStreak(
  achievedDays: readonly string[],
  today: string,
  freezes: readonly string[] = [],
) {
  const achieved = new Set(achievedDays),
    allowed = new Set([...achievedDays, ...freezes]);
  const all = [...allowed].sort();
  let longest = 0,
    run = 0,
    previous = "";
  for (const day of all) {
    run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
    previous = day;
    if (achieved.has(day)) longest = Math.max(longest, run);
  }
  let current = 0,
    day = allowed.has(today) ? today : shiftDay(today, -1);
  while (allowed.has(day)) {
    current++;
    day = shiftDay(day, -1);
  }
  return { current, longest };
}
