"use client";

import { RotateCcw, Trophy } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Surface } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { useResetProgress, useSetProgress, useTestResults } from "@/features/progress/hooks";
import type { CardStatus, StudySet } from "@/lib/types";
import { summarizeProgress } from "../lib/set-utils";

const SEGMENTS: ReadonlyArray<{ status: CardStatus; className: string }> = [
  { status: "known", className: "bg-success" },
  { status: "learning", className: "bg-accent" },
  { status: "new", className: "bg-surface-3" },
];

export function ProgressPanel({ set }: { set: StudySet }) {
  const t = useTranslations("set");
  const { toast } = useToast();
  const { data: progress = [] } = useSetProgress(set.id);
  const { data: results = [] } = useTestResults(set.id);
  const reset = useResetProgress(set.id);
  const summary = summarizeProgress(set.cards, progress);
  const lastResult = results[0];

  return (
    <Surface className="flex flex-col gap-5 p-5 sm:p-6 lg:self-start">
      <h2 className="text-lg font-bold">{t("progressTitle")}</h2>
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        {SEGMENTS.map(({ status, className }) => (
          <div
            key={status}
            className={`${className} transition-[flex-grow] duration-500`}
            style={{ flexGrow: summary[status], flexBasis: 0 }}
          />
        ))}
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {SEGMENTS.map(({ status, className }) => (
          <div key={status} className="rounded-lg bg-surface-2 p-3">
            <dt className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <span
                className={`size-2 rounded-full ${className} ${status === "new" ? "ring-1 ring-border-strong" : ""}`}
                aria-hidden
              />
              {t(status)}
            </dt>
            <dd className="mt-1 text-2xl font-extrabold tabular-nums">{summary[status]}</dd>
          </div>
        ))}
      </dl>
      {lastResult ? (
        <p className="flex items-center gap-2 text-sm font-medium text-muted">
          <Trophy className="size-4 text-accent-strong" aria-hidden />
          {t("lastTest", { score: lastResult.score, total: lastResult.total })}
        </p>
      ) : null}
      {progress.length > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          loading={reset.isPending}
          onClick={() => reset.mutate(undefined, { onSuccess: () => toast(t("progressReset")) })}
        >
          <RotateCcw className="size-4" aria-hidden />
          {t("resetProgress")}
        </Button>
      ) : null}
    </Surface>
  );
}
