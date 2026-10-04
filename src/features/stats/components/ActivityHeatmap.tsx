"use client";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef } from "react";
import {
  buildHeatmap,
  heatLevel,
  HEAT_LEVELS,
  type ActivityDay,
  type HeatmapGrid,
} from "../lib/chart-data";
import { ChartTip, useChartTip, useDayFormat } from "./chart-kit";

const CELL = 15;
/** Month labels closer than this many columns would overlap the previous one. */
const MIN_LABEL_COLUMNS = 3;
const GAP = 3;
const HEAT_FILL = [
  "var(--surface-3)",
  "var(--heat-1)",
  "var(--heat-2)",
  "var(--heat-3)",
  "var(--heat-4)",
];
// A Monday, Wednesday and Friday, used only to print localized weekday initials.
const LABELLED_WEEKDAYS = [
  { row: 0, day: "2026-10-05" },
  { row: 2, day: "2026-10-07" },
  { row: 4, day: "2026-10-09" },
];

function Cell({
  day,
  max,
  onShow,
  onHide,
}: {
  day: ActivityDay | null;
  max: number;
  onShow: (target: Element, day: ActivityDay) => void;
  onHide: () => void;
}) {
  if (!day) return <span style={{ width: CELL, height: CELL }} />;
  return (
    <span
      className="rounded-[3px] transition-transform duration-150 hover:scale-125"
      style={{
        width: CELL,
        height: CELL,
        background: HEAT_FILL[heatLevel(day.cards, max)],
        boxShadow: day.goalMet ? "inset 0 0 0 2px var(--accent-strong)" : undefined,
      }}
      onPointerEnter={(event) => onShow(event.currentTarget, day)}
      onPointerLeave={onHide}
    />
  );
}

export function ActivityHeatmap({ days }: { days: ActivityDay[] }) {
  const t = useTranslations("stats");
  const formatDay = useDayFormat();
  const wrapper = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const { tip, show, hide } = useChartTip(wrapper);
  const grid = useMemo(() => buildHeatmap(days), [days]);
  const max = useMemo(() => Math.max(0, ...days.map((day) => day.cards)), [days]);
  // Narrow screens show the most recent weeks first.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [grid]);
  const showDay = (target: Element, day: ActivityDay) =>
    show(target, {
      title: formatDay(day.day, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      value: t("dayTooltip", { cards: day.cards, minutes: Math.round(day.minutes) }),
    });

  return (
    <div ref={wrapper} className="relative" aria-hidden>
      <div className="flex gap-2">
        <div
          className="mt-6 grid shrink-0 text-[11px] text-muted"
          style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, rowGap: GAP }}
        >
          {LABELLED_WEEKDAYS.map(({ row, day }) => (
            <span key={row} style={{ gridRow: row + 1 }} className="leading-[15px]">
              {formatDay(day, { weekday: "short" })}
            </span>
          ))}
        </div>
        <div ref={scroller} className="overflow-x-auto pb-2">
          <div
            className="relative mb-2 h-4 text-[11px] text-muted"
            style={{ width: grid.weeks.length * (CELL + GAP) }}
          >
            {spacedMonths(grid.months).map((month) => (
              <span
                key={month.day}
                className="absolute whitespace-nowrap"
                style={{ left: month.column * (CELL + GAP) }}
              >
                {formatDay(month.day, { month: "short" })}
              </span>
            ))}
          </div>
          <div className="flex" style={{ gap: GAP }}>
            {grid.weeks.map((week, column) => (
              <div key={column} className="flex flex-col" style={{ gap: GAP }}>
                {week.map((day, row) => (
                  <Cell
                    key={day?.day ?? `pad-${column}-${row}`}
                    day={day}
                    max={max}
                    onShow={showDay}
                    onHide={hide}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <HeatLegend />
      <ChartTip tip={tip} />
    </div>
  );
}

function spacedMonths(months: HeatmapGrid["months"]) {
  // Drop a label that would crowd the next one (e.g. a partial first month).
  return months.filter((month, i) => {
    const next = months[i + 1];
    return !next || next.column - month.column >= MIN_LABEL_COLUMNS;
  });
}

function HeatLegend() {
  const t = useTranslations("stats");
  return (
    <div className="mt-3 flex flex-wrap items-center justify-end gap-x-5 gap-y-2 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        {t("less")}
        {Array.from({ length: HEAT_LEVELS + 1 }, (_, level) => (
          <span
            key={level}
            className="size-3 rounded-[3px]"
            style={{ background: HEAT_FILL[level] }}
          />
        ))}
        {t("more")}
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="size-3 rounded-[3px] bg-surface-3"
          style={{ boxShadow: "inset 0 0 0 2px var(--accent-strong)" }}
        />
        {t("goalMetLegend")}
      </span>
    </div>
  );
}
