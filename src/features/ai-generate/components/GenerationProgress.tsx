"use client";

import { Check, LoaderCircle, WandSparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { GENERATION_STAGES, type GenerationStage } from "../lib/generator";

export function GenerationProgress({
  stage,
  progress,
  onCancel,
}: {
  stage: GenerationStage | null;
  progress?: { completed?: number; total?: number };
  onCancel: () => void;
}) {
  const t = useTranslations("ai");
  const tCommon = useTranslations("common");
  const currentIndex = stage ? GENERATION_STAGES.indexOf(stage) : -1;

  return (
    <div className="mx-auto flex w-full max-w-md animate-pop flex-col items-center gap-6 rounded-xl border border-border bg-surface p-8 text-center shadow-lg">
      <span className="relative grid size-16 place-items-center rounded-2xl bg-accent text-on-accent shadow-[0_4px_0_var(--accent-strong)]">
        <WandSparkles className="size-8 animate-pulse" aria-hidden />
      </span>
      <h1 className="text-2xl font-extrabold">{t("generatingTitle")}</h1>
      <ol className="flex w-full flex-col gap-2 text-left" aria-live="polite">
        {GENERATION_STAGES.map((item, index) => {
          const done =
            index < currentIndex ||
            (item === "done" && currentIndex === GENERATION_STAGES.length - 1);
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
      {progress?.total ? (
        <p aria-live="polite">
          {t("chunkProgress", { completed: progress.completed ?? 0, total: progress.total })}
        </p>
      ) : null}
      <Button variant="secondary" onClick={onCancel}>
        {tCommon("cancel")}
      </Button>
    </div>
  );
}
