"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { QueryError } from "@/components/ui/QueryState";
import { useToast } from "@/components/ui/Toast";
import { useErrorMessage } from "@/lib/use-messages";
import { useStats, useFreeze } from "@/features/srs/hooks";
function Bars({
  rows,
  valueLabel,
}: {
  rows: { label: string; value: number }[];
  valueLabel: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <>
      <div className="space-y-2" aria-hidden>
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-2 text-sm"
          >
            <span className="truncate">{row.label}</span>
            <span className="h-3 overflow-hidden rounded bg-surface-3">
              <span
                className="block h-full rounded bg-primary"
                style={{ width: `${(row.value / max) * 100}%` }}
              />
            </span>
            <span className="text-right tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>{valueLabel}</caption>
        <thead>
          <tr>
            <th scope="col">{valueLabel}</th>
            <th scope="col">{valueLabel}</th>
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
    </>
  );
}
export function StatsView() {
  const t = useTranslations("stats"),
    query = useStats(),
    freeze = useFreeze(),
    { toast } = useToast(),
    errorMessage = useErrorMessage();
  if (query.isError) return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return <p role="status">{t("loading")}</p>;
  const data = query.data,
    goal = data.preferences.goal,
    value = data.preferences.goalType === "cards" ? data.today.cards : data.today.minutes;
  const metric = [
    { label: t("currentStreak"), value: data.streak.current },
    { label: t("longestStreak"), value: data.streak.longest },
    { label: t("knownCards"), value: data.knownCards },
    { label: t("dailyGoal"), value: `${value}/${goal}` },
  ];
  return (
    <div className="flex flex-col gap-7">
      <h1 className="text-title font-extrabold">{t("title")}</h1>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metric.map((m) => (
          <div key={m.label} className="rounded-xl border border-border bg-surface p-4">
            <dt className="text-sm text-muted">{m.label}</dt>
            <dd className="mt-2 text-2xl font-extrabold tabular-nums">{m.value}</dd>
          </div>
        ))}
      </dl>
      <div>
        <Button
          variant="secondary"
          loading={freeze.isPending}
          onClick={() =>
            freeze.mutate(undefined, {
              onSuccess: () => toast(t("freezeSaved")),
              onError: (e) => toast(errorMessage(e), "error"),
            })
          }
        >
          {t("freeze")}
        </Button>
        <p className="mt-2 text-sm text-muted">{t("freezeHint")}</p>
      </div>
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-lg font-bold">{t("activity")}</h2>
        <div className="overflow-x-auto pb-3">
          <div className="grid w-max grid-flow-col grid-rows-7 gap-1" aria-hidden>
            {data.activity.map((day) => (
              <span
                key={day.day}
                title={`${day.day}: ${day.cards}`}
                className="size-3 rounded-sm"
                style={{
                  background: day.goalMet
                    ? "var(--primary)"
                    : day.cards > 0
                      ? "var(--primary-soft)"
                      : "var(--surface-3)",
                }}
              />
            ))}
          </div>
        </div>
        <p className="mt-2 text-sm text-muted">{t("activityLegend")}</p>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold">{t("dataTable")}</summary>
          <div className="max-h-80 overflow-auto">
            <table className="mt-3 w-full text-sm">
              <caption className="sr-only">{t("activity")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("day")}</th>
                  <th scope="col">{t("cards")}</th>
                  <th scope="col">{t("minutes")}</th>
                  <th scope="col">{t("goalMet")}</th>
                </tr>
              </thead>
              <tbody>
                {data.activity.toReversed().map((day) => (
                  <tr key={day.day}>
                    <th scope="row" className="p-1 font-normal">
                      {day.day}
                    </th>
                    <td className="text-center">{day.cards}</td>
                    <td className="text-center">{day.minutes}</td>
                    <td className="text-center">{day.goalMet ? t("yes") : t("no")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-4 font-bold">{t("forecast")}</h2>
          <Bars
            rows={data.forecast.map((r) => ({ label: r.day, value: r.count }))}
            valueLabel={t("cards")}
          />
        </section>
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-4 font-bold">{t("weeklyTime")}</h2>
          <Bars
            rows={data.weekly.map((r) => ({ label: r.day, value: r.minutes }))}
            valueLabel={t("minutes")}
          />
        </section>
      </div>
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 font-bold">{t("learnedHistory")}</h2>
        <Bars
          rows={data.learnedHistory
            .filter((_, i) => i % 30 === 0 || i === data.learnedHistory.length - 1)
            .map((r) => ({ label: r.day, value: r.count }))}
          valueLabel={t("cards")}
        />
      </section>
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 font-bold">{t("accuracy")}</h2>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th scope="col" className="text-left">
                  {t("set")}
                </th>
                <th scope="col">{t("accuracy")}</th>
              </tr>
            </thead>
            <tbody>
              {data.accuracy.map((row) => (
                <tr key={row.setId}>
                  <th scope="row" className="p-2 text-left font-normal">
                    {row.title}
                  </th>
                  <td className="text-center tabular-nums">{Math.round(row.accuracy * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
