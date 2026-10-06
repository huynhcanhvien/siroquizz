"use client";
import { useTranslations } from "next-intl";
import { useAdminQuery } from "../hooks";
import { overviewSchema } from "../schemas";
import { QueryStatus } from "./QueryStatus";
export function OverviewPage() {
  const t = useTranslations("admin");
  const query = useAdminQuery("overview", overviewSchema, true);
  const data = query.data;
  const metrics = data
    ? ([
        ["newUsers", data.users.newThisWeek],
        ["totalUsers", data.users.total],
        ["publicSets", data.sets.public],
        ["jobsToday", data.jobs.today],
        ["failedJobs", data.jobs.failed],
        ["runningJobs", data.jobs.running],
        ["openReports", data.openReports],
        [
          "tokenUsage",
          `${data.tokens.used.toLocaleString()} / ${data.tokens.limit.toLocaleString()}`,
        ],
      ] as const)
    : [];
  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-title font-extrabold">{t("overview")}</h1>
      <p className="text-sm text-muted">{t("refreshHint")}</p>
      <QueryStatus query={query} />
      {data ? (
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(([key, value]) => (
            <div key={key} className="min-w-0 rounded-xl border border-border bg-surface p-5">
              <dt className="text-sm text-muted">{t(key)}</dt>
              <dd className="mt-2 text-2xl font-bold break-words">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
