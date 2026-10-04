"use client";
import { useFormatter } from "next-intl";
import { useCallback, useState, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/cn";

/** A stats card: one surface, one heading, generous padding. */
export function Panel({
  title,
  aside,
  className,
  children,
}: {
  title?: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn("rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6", className)}
    >
      {title ? (
        <header className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">{title}</h2>
          {aside ? <p className="text-sm text-muted">{aside}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

type DayFormatOptions = Pick<Intl.DateTimeFormatOptions, "weekday" | "day" | "month" | "year">;
/** Day keys are calendar days in the learner's zone; format them as plain dates (UTC noon). */
export function useDayFormat() {
  const format = useFormatter();
  return useCallback(
    (day: string, options: DayFormatOptions) =>
      format.dateTime(new Date(`${day}T12:00:00Z`), { ...options, timeZone: "UTC" }),
    [format],
  );
}

export interface TipContent {
  title: string;
  value: string;
}
interface TipState extends TipContent {
  x: number;
  y: number;
}

/** Positions a single tooltip above the hovered/focused mark, relative to the chart container. */
export function useChartTip(container: RefObject<HTMLElement | null>) {
  const [tip, setTip] = useState<TipState | null>(null);
  const show = useCallback(
    (target: Element, content: TipContent) => {
      const box = container.current?.getBoundingClientRect();
      const mark = target.getBoundingClientRect();
      if (!box) return;
      setTip({ ...content, x: mark.left - box.left + mark.width / 2, y: mark.top - box.top });
    },
    [container],
  );
  const showAt = useCallback(
    (x: number, y: number, content: TipContent) => setTip({ ...content, x, y }),
    [],
  );
  const hide = useCallback(() => setTip(null), []);
  return { tip, show, showAt, hide };
}

export function ChartTip({ tip }: { tip: TipState | null }) {
  if (!tip) return null;
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface px-3 py-2 text-xs whitespace-nowrap shadow-md"
      style={{ left: tip.x, top: tip.y - 8 }}
    >
      <p className="text-sm font-bold">{tip.value}</p>
      <p className="text-muted">{tip.title}</p>
    </div>
  );
}

/** Screen-reader twin of a chart: every plotted value as a table. */
export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: [string, string];
  rows: { label: string; value: string }[];
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{columns[0]}</th>
          <th scope="col">{columns[1]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <td>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
