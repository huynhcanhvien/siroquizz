"use client";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { createHttpClient } from "@/lib/http-client";
import { aiJobsQuery } from "../lib/jobs-query";
import { quotaSchema } from "../schemas";
import type { GenerateResult, GenerationOptions } from "../lib/generator";
const client = createHttpClient();
export function GenerationHistory({
  onOpen,
}: {
  onOpen: (result: GenerateResult, prompt: string, options: GenerationOptions) => void;
}) {
  const t = useTranslations("ai");
  const quota = useQuery({
    queryKey: ["ai-quota"],
    queryFn: async () => (await client.request("/api/v1/ai/quota", quotaSchema)).data,
  });
  const jobs = useQuery(aiJobsQuery);
  return (
    <section
      className="rounded-xl border border-border bg-surface p-5"
      aria-labelledby="ai-history-title"
    >
      {quota.data ? (
        <p className="mb-4 text-sm text-muted">
          {t("credits", {
            remaining: quota.data.dailyRemaining,
            limit: quota.data.dailyLimit,
            earned: quota.data.earned,
            time: new Date(quota.data.resetsAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          })}
        </p>
      ) : null}
      <h2 id="ai-history-title" className="font-bold">
        {t("history")}
      </h2>
      <ul className="mt-3 space-y-2">
        {jobs.data?.map((job) => (
          <li key={job.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              {new Date(job.createdAt).toLocaleString()} · {t(`jobStatus.${job.status}`)} ·{" "}
              {job.creditsCharged
                ? `${t("historyCredits", { credits: job.creditsCharged })} · `
                : ""}
              {job.prompt}
            </span>
            {job.result ? (
              <Button size="sm" onClick={() => onOpen(job.result!, job.prompt, job.options)}>
                {t("reopen")}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {!jobs.data?.length ? <p className="mt-2 text-sm text-muted">{t("historyEmpty")}</p> : null}
    </section>
  );
}
