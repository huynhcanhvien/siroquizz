"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";

interface SetAccuracy {
  setId: string;
  title: string;
  score: number;
  total: number;
  accuracy: number;
}

/** One series, so one hue: bar length carries accuracy, the exact figures sit at the tip. */
export function AccuracyBars({ rows }: { rows: SetAccuracy[] }) {
  const t = useTranslations("stats");
  const sorted = rows.toSorted((a, b) => b.accuracy - a.accuracy);
  if (!sorted.length) return <p className="text-sm text-muted">{t("noAccuracy")}</p>;
  return (
    <ul className="flex flex-col gap-4">
      {sorted.map((row) => {
        const percent = Math.round(row.accuracy * 100);
        return (
          <li
            key={row.setId}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5"
          >
            <Link
              href={`/sets/${row.setId}`}
              className="truncate font-semibold hover:text-primary-text hover:underline"
            >
              {row.title}
            </Link>
            <span className="text-right text-sm tabular-nums">
              <strong className="font-bold">{percent}%</strong>{" "}
              <span className="text-muted">
                ({row.score}/{row.total})
              </span>
            </span>
            <span
              role="meter"
              aria-label={row.title}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="col-span-2 h-2.5 overflow-hidden rounded-full bg-surface-3"
            >
              <span
                className="block h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${percent}%` }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
