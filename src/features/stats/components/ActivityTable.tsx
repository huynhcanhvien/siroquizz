"use client";
import { useTranslations } from "next-intl";
import type { ActivityDay } from "../lib/chart-data";

/** The heatmap's table view: every day with activity, newest first. */
export function ActivityTable({ days }: { days: ActivityDay[] }) {
  const t = useTranslations("stats");
  const active = days.filter((day) => day.cards > 0 || day.minutes > 0).toReversed();
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-semibold text-primary-text">
        {t("dataTable")}
      </summary>
      <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("activity")}</caption>
          <thead className="sticky top-0 bg-surface-2 text-left">
            <tr>
              <th scope="col" className="px-3 py-2">
                {t("day")}
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                {t("cards")}
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                {t("minutes")}
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                {t("goalMet")}
              </th>
            </tr>
          </thead>
          <tbody>
            {active.map((day) => (
              <tr key={day.day} className="border-t border-border">
                <th scope="row" className="px-3 py-1.5 font-normal tabular-nums">
                  {day.day}
                </th>
                <td className="px-3 py-1.5 text-right tabular-nums">{day.cards}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{Math.round(day.minutes)}</td>
                <td className="px-3 py-1.5 text-right">{day.goalMet ? t("yes") : t("no")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
