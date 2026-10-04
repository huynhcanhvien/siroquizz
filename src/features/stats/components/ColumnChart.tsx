"use client";
import { useRef } from "react";
import { cn } from "@/lib/cn";
import { niceMax } from "../lib/chart-data";
import { ChartTip, useChartTip, type TipContent } from "./chart-kit";

export interface Column {
  key: string;
  /** Short axis label under the column. */
  label: string;
  /** Narrow-screen alternative when `label` is long (e.g. "Today"). */
  shortLabel?: string;
  value: number;
  tip: TipContent;
  /** Emphasise one column (e.g. today) with a stronger axis label. */
  current?: boolean;
}

const PLOT_HEIGHT = 168;

/**
 * Single-series column chart: one hue, ≤24px columns with rounded caps on one baseline, hairline
 * gridlines at the max and half ticks, values on caps only where labelled.
 */
export function ColumnChart({
  columns,
  caption,
  formatValue,
  labelValues,
}: {
  columns: Column[];
  /** Accessible name for the chart; each column is also a labelled, focusable element. */
  caption: string;
  formatValue: (value: number) => string;
  /** Which columns get a value printed on the cap. */
  labelValues: (column: Column, index: number) => boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const { tip, show, hide } = useChartTip(container);
  const top = niceMax(Math.max(0, ...columns.map((c) => c.value)));
  // A half tick is only drawn when it lands on a whole number.
  const ticks = top % 2 === 0 ? [1, 0.5, 0] : [1, 0];
  const crowded = columns.length > 8;
  return (
    <div ref={container} className="relative">
      <div
        role="group"
        aria-label={caption}
        className="relative pl-9"
        style={{ height: PLOT_HEIGHT }}
      >
        {ticks.map((tick) => (
          <div
            aria-hidden
            key={tick}
            className="absolute inset-x-0 flex items-center"
            style={{ bottom: tick * PLOT_HEIGHT }}
          >
            <span className="w-8 -translate-y-px pr-2 text-right text-[11px] text-muted tabular-nums">
              {formatValue(top * tick)}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
        ))}
        <div className="absolute inset-y-0 right-0 left-9 flex items-end justify-around">
          {columns.map((column, index) => {
            const height = (column.value / top) * PLOT_HEIGHT;
            return (
              <div
                key={column.key}
                tabIndex={0}
                role="img"
                aria-label={`${column.tip.title}: ${column.tip.value}`}
                className="group relative flex h-full min-w-6 flex-1 items-end justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onPointerEnter={(event) =>
                  show(event.currentTarget.firstElementChild ?? event.currentTarget, column.tip)
                }
                onPointerLeave={hide}
                onFocus={(event) =>
                  show(event.currentTarget.firstElementChild ?? event.currentTarget, column.tip)
                }
                onBlur={hide}
              >
                <span
                  className="w-full max-w-6 rounded-t-[4px] bg-primary transition-[height,opacity] duration-500 group-hover:opacity-80"
                  style={{ height: Math.max(column.value > 0 ? 3 : 0, height) }}
                />
                {column.value > 0 && labelValues(column, index) ? (
                  <span
                    aria-hidden
                    className="absolute text-xs font-semibold tabular-nums"
                    style={{ bottom: height + 4 }}
                  >
                    {formatValue(column.value)}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex justify-around pl-9 text-[11px] text-muted" aria-hidden>
        {columns.map((column, index) => (
          <span
            key={column.key}
            className={cn(
              "min-w-6 flex-1 text-center whitespace-nowrap",
              column.current && "font-bold text-text",
              // On phones every other label is hidden (counting back from the current one) so none overlap.
              crowded && (columns.length - 1 - index) % 2 === 1 && "max-sm:invisible",
            )}
          >
            {column.shortLabel ? (
              <>
                <span className="max-sm:hidden">{column.label}</span>
                <span className="sm:hidden">{column.shortLabel}</span>
              </>
            ) : (
              column.label
            )}
          </span>
        ))}
      </div>
      <ChartTip tip={tip} />
    </div>
  );
}
