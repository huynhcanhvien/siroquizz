"use client";
import { BookCheck, CalendarDays, Check, Flame, TrendingDown, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { splitMinutes } from "../lib/chart-data";

const RING_RADIUS = 40;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function Tile({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <p className="flex items-center gap-2 text-sm font-semibold text-muted">
        <span className="grid size-7 place-items-center rounded-lg bg-primary-soft text-primary-text">
          {icon}
        </span>
        {label}
      </p>
      {children}
    </div>
  );
}

export function StreakHero({
  current,
  longest,
  freezing,
  onFreeze,
}: {
  current: number;
  longest: number;
  freezing: boolean;
  onFreeze: () => void;
}) {
  const t = useTranslations("stats");
  return (
    <section className="relative flex flex-col justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-[linear-gradient(150deg,var(--accent-soft),var(--surface)_62%)] p-6 shadow-sm">
      <div>
        <p className="flex items-center gap-2 font-semibold text-muted">
          <span className="grid size-9 place-items-center rounded-xl bg-accent text-on-accent">
            <Flame className="size-5" aria-hidden />
          </span>
          {t("currentStreak")}
        </p>
        <p className="mt-5 flex items-baseline gap-3">
          <span className="text-7xl leading-none font-extrabold tracking-tight">{current}</span>
          <span className="text-lg font-semibold text-muted">{t("streakDays")}</span>
        </p>
        <p className="mt-3 text-sm font-semibold text-muted">
          {t("streakRecord", { count: longest })}
        </p>
      </div>
      <div>
        <Button variant="secondary" size="sm" loading={freezing} onClick={onFreeze}>
          {t("freeze")}
        </Button>
        <p className="mt-2 text-xs text-muted">{t("freezeHint")}</p>
      </div>
    </section>
  );
}

export function GoalTile({
  value,
  goal,
  unit,
}: {
  value: number;
  goal: number;
  unit: "cards" | "minutes";
}) {
  const t = useTranslations("stats");
  const unitLabel = t(unit === "cards" ? "unitCards" : "unitMinutes");
  const done = value >= goal;
  const ratio = goal > 0 ? Math.min(1, value / goal) : 0;
  const remaining = Math.max(0, Math.ceil(goal - value));
  return (
    <Tile icon={<Check className="size-4" aria-hidden />} label={t("dailyGoal")}>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 96 96" className="size-16 shrink-0 -rotate-90" aria-hidden>
          <circle
            cx="48"
            cy="48"
            r={RING_RADIUS}
            fill="none"
            stroke="var(--surface-3)"
            strokeWidth="10"
          />
          {ratio > 0 ? (
            <circle
              cx="48"
              cy="48"
              r={RING_RADIUS}
              fill="none"
              stroke={done ? "var(--success)" : "var(--primary)"}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${ratio * RING_LENGTH} ${RING_LENGTH}`}
              className="transition-[stroke-dasharray] duration-500"
            />
          ) : null}
        </svg>
        <p className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-4xl font-extrabold">{Math.round(value)}</span>
          <span className="text-lg font-semibold text-muted">
            /{goal} {unitLabel}
          </span>
        </p>
      </div>
      <p className={cn("mt-auto text-sm font-semibold", done ? "text-success" : "text-muted")}>
        {done ? t("goalDone") : t("goalRemaining", { count: remaining, unit: unitLabel })}
      </p>
    </Tile>
  );
}

export function KnownTile({ count, gain }: { count: number; gain: number }) {
  const t = useTranslations("stats");
  return (
    <Tile icon={<BookCheck className="size-4" aria-hidden />} label={t("knownCards")}>
      <p className="text-4xl font-extrabold">{count}</p>
      <p className="text-sm text-muted">{t("knownHint")}</p>
      {gain > 0 ? (
        <p className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">
          <TrendingUp className="size-3.5" aria-hidden />
          {t("knownGain", { count: gain })}
        </p>
      ) : null}
    </Tile>
  );
}

/** 12-week trend: past weeks in the de-emphasis tint, the current week in the accent. */
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div aria-hidden className="mt-auto flex h-10 items-end gap-[3px]">
      {values.map((value, i) => (
        <span
          key={i}
          className={cn(
            "flex-1 rounded-t-[3px]",
            i === values.length - 1 ? "bg-primary" : "bg-primary-soft",
          )}
          style={{ height: `${Math.max(value > 0 ? 8 : 4, (value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

export function WeekTimeTile({
  minutes,
  delta,
  trend,
}: {
  minutes: number;
  delta: number | null;
  trend: number[];
}) {
  const t = useTranslations("stats");
  const { hours, minutes: rest } = splitMinutes(minutes);
  const Trend = delta !== null && delta < 0 ? TrendingDown : TrendingUp;
  return (
    <Tile icon={<CalendarDays className="size-4" aria-hidden />} label={t("weekTime")}>
      <p className="text-3xl font-extrabold">
        {hours
          ? t("durationHours", { hours, minutes: rest })
          : t("durationMinutes", { minutes: rest })}
      </p>
      {delta === null ? null : (
        <p
          className={cn(
            "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
            delta > 0 ? "bg-success-soft text-success" : "bg-surface-2 text-muted",
          )}
        >
          {delta === 0 ? null : <Trend className="size-3.5" aria-hidden />}
          {delta > 0
            ? t("deltaUp", { count: delta })
            : delta < 0
              ? t("deltaDown", { count: -delta })
              : t("deltaSame")}
        </p>
      )}
      <Sparkline values={trend} />
    </Tile>
  );
}
