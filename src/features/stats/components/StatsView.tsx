"use client";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { QueryError } from "@/components/ui/QueryState";
import { Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { useSession } from "@/features/auth/hooks";
import { useFreeze, useStats } from "@/features/srs/hooks";
import { useErrorMessage } from "@/lib/use-messages";
import type { z } from "zod";
import { recentGain, summarizeActivity, weekOverWeek } from "../lib/chart-data";
import type { statsSchema } from "../schemas";
import { AccuracyBars } from "./AccuracyBars";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { ActivityTable } from "./ActivityTable";
import { Panel, useDayFormat } from "./chart-kit";
import { ColumnChart, type Column } from "./ColumnChart";
import { LearnedChart } from "./LearnedChart";
import { GoalTile, KnownTile, StreakHero, WeekTimeTile } from "./StatTiles";

type Stats = z.infer<typeof statsSchema>;

function StatsSkeleton() {
  const t = useTranslations("stats");
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">{t("loading")}</span>
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

function useCharts(data: Stats) {
  const t = useTranslations("stats");
  const formatDay = useDayFormat();
  return useMemo(() => {
    const forecast: Column[] = data.forecast.map((row, i) => ({
      key: row.day,
      label: i === 0 ? t("today") : formatDay(row.day, { weekday: "short" }),
      shortLabel: formatDay(row.day, { weekday: "short" }),
      value: row.count,
      current: i === 0,
      tip: {
        title: formatDay(row.day, { weekday: "long", day: "numeric", month: "long" }),
        value: t("cardsValue", { count: row.count }),
      },
    }));
    const weekly: Column[] = data.weekly.map((row, i) => ({
      key: row.day,
      label: formatDay(row.day, { day: "numeric", month: "numeric" }),
      value: Math.round(row.minutes),
      current: i === data.weekly.length - 1,
      tip: {
        title: t("weekOf", { date: formatDay(row.day, { day: "numeric", month: "long" }) }),
        value: t("minutesValue", { count: Math.round(row.minutes) }),
      },
    }));
    return { forecast, weekly };
  }, [data, formatDay, t]);
}

export function StatsView() {
  const t = useTranslations("stats");
  const query = useStats();
  const { data: user } = useSession();
  if (query.isError) return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return <StatsSkeleton />;
  return <StatsDashboard data={query.data} name={user?.displayName ?? ""} title={t("title")} />;
}

function StatsDashboard({ data, name, title }: { data: Stats; name: string; title: string }) {
  const t = useTranslations("stats");
  const freeze = useFreeze();
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const charts = useCharts(data);
  const summary = summarizeActivity(data.activity);
  const week = weekOverWeek(data.weekly);
  const goalUnit = data.preferences.goalType === "cards" ? "cards" : "minutes";
  const learned = data.learnedHistory.at(-1)?.count ?? 0;
  const onFreeze = () =>
    freeze.mutate(undefined, {
      onSuccess: () => toast(t("freezeSaved")),
      onError: (e) => toast(errorMessage(e), "error"),
    });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm font-bold tracking-wide text-primary-text uppercase">
          {t("eyebrow")}
        </p>
        <h1 className="mt-1 text-title font-extrabold">{title}</h1>
        <p className="mt-2 text-muted">{t("subtitle", { name })}</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.35fr_1fr_1fr_1fr]">
        <StreakHero
          current={data.streak.current}
          longest={data.streak.longest}
          freezing={freeze.isPending}
          onFreeze={onFreeze}
        />
        <GoalTile
          value={goalUnit === "cards" ? data.today.cards : data.today.minutes}
          goal={data.preferences.goal}
          unit={goalUnit}
        />
        <WeekTimeTile
          minutes={week.current}
          delta={week.delta}
          trend={data.weekly.map((w) => w.minutes)}
        />
        <KnownTile count={data.knownCards} gain={recentGain(data.learnedHistory)} />
      </div>
      <Panel
        title={t("activity")}
        aside={t("activitySummary", {
          days: summary.studyDays,
          cards: summary.cards,
          goals: summary.goalDays,
        })}
      >
        <ActivityHeatmap days={data.activity} />
        <p className="mt-3 text-sm text-muted">{t("activityLegend")}</p>
        <ActivityTable days={data.activity} />
      </Panel>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t("forecast")}>
          {charts.forecast.some((c) => c.value > 0) ? (
            <ColumnChart
              columns={charts.forecast}
              caption={t("forecast")}
              formatValue={(v) => String(Math.round(v))}
              labelValues={() => true}
            />
          ) : (
            <p className="text-sm text-muted">{t("noForecast")}</p>
          )}
        </Panel>
        <Panel title={t("weeklyTime")}>
          {charts.weekly.some((c) => c.value > 0) ? (
            <ColumnChart
              columns={charts.weekly}
              caption={t("weeklyTime")}
              formatValue={(v) => String(Math.round(v))}
              labelValues={(column, i) =>
                i === charts.weekly.length - 1 ||
                column.value === Math.max(...charts.weekly.map((c) => c.value))
              }
            />
          ) : (
            <p className="text-sm text-muted">{t("noWeekly")}</p>
          )}
        </Panel>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel
          title={t("learnedHistory")}
          aside={learned ? t("learnedNow", { count: learned }) : undefined}
        >
          {learned ? (
            <LearnedChart history={data.learnedHistory} />
          ) : (
            <p className="text-sm text-muted">{t("noLearned")}</p>
          )}
        </Panel>
        <Panel title={t("accuracy")}>
          <AccuracyBars rows={data.accuracy} />
        </Panel>
      </div>
    </div>
  );
}
