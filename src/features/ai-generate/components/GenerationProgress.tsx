"use client";

import { Check, LoaderCircle, WandSparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import {
  GENERATION_STAGES,
  type GenerationProgress as Progress,
  type GenerationStage,
} from "../lib/generator";

export function GenerationProgress({
  stage,
  progress,
  onCancel,
}: {
  stage: GenerationStage | null;
  progress?: Progress;
  onCancel: () => void;
}) {
  const t = useTranslations("ai");
  const tCommon = useTranslations("common");
  // The on-device scanning step only shows when this request had scans to read.
  const stages = GENERATION_STAGES.filter(
    (item) => item !== "scanning" || stage === "scanning" || progress?.scanned,
  );
  const currentIndex = stage ? stages.indexOf(stage) : -1;

  return (
    <div className="mx-auto flex w-full max-w-md animate-pop flex-col items-center gap-6 rounded-xl border border-border bg-surface p-8 text-center shadow-lg">
      <span className="relative grid size-16 place-items-center rounded-2xl bg-accent text-on-accent shadow-[0_4px_0_var(--accent-strong)]">
        <WandSparkles className="size-8 animate-pulse" aria-hidden />
      </span>
      <h1 className="text-2xl font-extrabold">{t("generatingTitle")}</h1>
      <ol className="flex w-full flex-col gap-2 text-left" aria-live="polite">
        {stages.map((item, index) => {
          const done =
            index < currentIndex || (item === "done" && currentIndex === stages.length - 1);
          const active = index === currentIndex && !done;
          return (
            <li
              key={item}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-4 py-3 font-semibold transition-colors",
                active ? "bg-primary-soft text-primary-text" : done ? "text-text" : "text-subtle",
              )}
            >
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full",
                  done ? "bg-success text-white" : "bg-surface-3",
                )}
              >
                {done ? (
                  <Check className="size-4" aria-hidden />
                ) : active ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : null}
              </span>
              {t(`stage.${item}`)}
            </li>
          );
        })}
      </ol>
      {progress?.pages && stage === "scanning" ? (
        <p aria-live="polite">{t("pageProgress", progress.pages)}</p>
      ) : null}
      {progress?.total ? (
        <p aria-live="polite">
          {t("chunkProgress", { completed: progress.completed ?? 0, total: progress.total })}
        </p>
      ) : null}
      {progress?.queuePosition ? (
        <p role="status" className="text-sm text-muted">
          {t("queuePosition", { count: progress.queuePosition })}
        </p>
      ) : null}
      {progress?.waiting ? (
        <p role="status" className="text-sm text-muted">
          {t("quotaWaiting")}
        </p>
      ) : null}
      {process.env.NEXT_PUBLIC_DATA_SOURCE === "http" ? (
        <p className="text-sm text-muted">{t("background.hint")}</p>
      ) : null}
      <Button variant="secondary" onClick={onCancel}>
        {tCommon("cancel")}
      </Button>
    </div>
  );
}
