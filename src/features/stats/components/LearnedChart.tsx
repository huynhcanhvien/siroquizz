"use client";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/cn";
import { niceMax } from "../lib/chart-data";
import { ChartTip, DataTable, useChartTip, useDayFormat } from "./chart-kit";

interface Point {
  day: string;
  count: number;
}
const VIEW_W = 600;
const VIEW_H = 160;
const SAMPLE_EVERY_DAYS = 7;

/** One point per week (plus today) keeps the line smooth and the hover targets wide. */
function sample(history: readonly Point[]): Point[] {
  return history.filter((_, i) => i % SAMPLE_EVERY_DAYS === 0 || i === history.length - 1);
}

function paths(points: Point[], top: number) {
  const xy = points.map((p, i) => [
    (i / Math.max(1, points.length - 1)) * VIEW_W,
    VIEW_H - (p.count / top) * VIEW_H,
  ]);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  return { line, area: `${line}L${VIEW_W},${VIEW_H}L0,${VIEW_H}Z` };
}

export function LearnedChart({ history }: { history: Point[] }) {
  const t = useTranslations("stats");
  const formatDay = useDayFormat();
  const container = useRef<HTMLDivElement>(null);
  const plot = useRef<HTMLDivElement>(null);
  const { tip, showAt, hide } = useChartTip(container);
  const [active, setActive] = useState<number | null>(null);
  const points = useMemo(() => sample(history), [history]);
  const top = niceMax(Math.max(0, ...points.map((p) => p.count)));
  const { line, area } = useMemo(() => paths(points, top), [points, top]);
  const last = points.at(-1);
  if (!last) return null;

  const xPct = (i: number) => (i / Math.max(1, points.length - 1)) * 100;
  const yPct = (count: number) => (1 - count / top) * 100;
  const focus = (i: number) => {
    const box = plot.current?.getBoundingClientRect();
    const outer = container.current?.getBoundingClientRect();
    if (!box || !outer) return;
    setActive(i);
    showAt(
      box.left - outer.left + (xPct(i) / 100) * box.width,
      box.top - outer.top + (yPct(points[i].count) / 100) * box.height,
      {
        title: formatDay(points[i].day, { day: "numeric", month: "long", year: "numeric" }),
        value: t("learnedNow", { count: points[i].count }),
      },
    );
  };
  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    focus(Math.round(((event.clientX - box.left) / box.width) * (points.length - 1)));
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    focus(Math.min(points.length - 1, Math.max(0, (active ?? points.length - 1) + step)));
  };
  const clear = () => {
    setActive(null);
    hide();
  };

  return (
    <div ref={container} className="relative">
      <div className="relative pl-9">
        {[1, 0.5, 0].map((tick) => (
          <div
            key={tick}
            aria-hidden
            className="absolute inset-x-0 flex items-center"
            style={{ top: `${(1 - tick) * VIEW_H}px` }}
          >
            <span className="w-8 -translate-y-px pr-2 text-right text-[11px] text-muted tabular-nums">
              {Math.round(top * tick)}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
        ))}
        <div
          ref={plot}
          tabIndex={0}
          role="img"
          aria-label={`${t("learnedHistory")}: ${t("learnedNow", { count: last.count })}`}
          className="relative cursor-crosshair rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ height: VIEW_H }}
          onPointerMove={onMove}
          onPointerLeave={clear}
          onKeyDown={onKey}
          onBlur={clear}
        >
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
            aria-hidden
          >
            <path d={area} fill="var(--primary)" fillOpacity={0.1} />
            <path
              d={line}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {active === null ? null : (
            <span
              aria-hidden
              className="absolute inset-y-0 w-px bg-border-strong"
              style={{ left: `${xPct(active)}%` }}
            />
          )}
          <Dot
            left={xPct(active ?? points.length - 1)}
            top={yPct(points[active ?? points.length - 1].count)}
          />
        </div>
      </div>
      <MonthAxis points={points} />
      <ChartTip tip={tip} />
      <DataTable
        caption={t("learnedHistory")}
        columns={[t("day"), t("cards")]}
        rows={points
          .filter((p) => p.day.slice(8) <= "07" || p === last)
          .map((p) => ({ label: p.day, value: String(p.count) }))}
      />
    </div>
  );
}

function Dot({ left, top }: { left: number; top: number }) {
  return (
    <span
      aria-hidden
      className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-surface"
      style={{ left: `${left}%`, top: `${top}%` }}
    />
  );
}

function MonthAxis({ points }: { points: Point[] }) {
  const formatDay = useDayFormat();
  const labels = points
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => i > 0 && p.day.slice(5, 7) !== points[i - 1].day.slice(5, 7))
    .filter((_, n) => n % 2 === 0);
  return (
    <div aria-hidden className="relative mt-2 ml-9 h-4 text-[11px] text-muted">
      {labels.map(({ p, i }, n) => {
        const left = (i / Math.max(1, points.length - 1)) * 100;
        return (
          <span
            key={p.day}
            className={cn(
              "absolute whitespace-nowrap",
              left > 90 ? "-translate-x-full" : "-translate-x-1/2",
              n % 2 === 1 && "max-sm:hidden",
            )}
            style={{ left: `${left}%` }}
          >
            {formatDay(p.day, { month: "short" })}
          </span>
        );
      })}
    </div>
  );
}
