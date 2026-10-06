"use client";

import { BadgeCheck, CircleAlert, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import type { AiPhase } from "../AiGenerationProvider";
import { AI_PAGE } from "../lib/jobs-query";

/** What the indicator says for each phase: a headline, a detail line and its tone. */
function useIndicatorText(phase: Exclude<AiPhase, { name: "compose" }>) {
  const t = useTranslations("ai");
  if (phase.name === "confirm")
    return {
      tone: "attention",
      title: t("background.confirmTitle"),
      detail: t("background.confirm"),
    };
  if (phase.name === "review")
    return { tone: "ready", title: t("background.readyTitle"), detail: t("background.ready") };
  const { stage, progress } = phase;
  const detail = progress?.queuePosition
    ? t("background.queued", { count: progress.queuePosition })
    : progress?.waiting
      ? t("background.waiting")
      : [
          stage ? t(`stage.${stage}`) : null,
          progress?.total
            ? t("background.parts", { completed: progress.completed ?? 0, total: progress.total })
            : null,
        ]
          .filter(Boolean)
          .join(" · ");
  return { tone: "working", title: t("background.title"), detail };
}

/**
 * A small card, on every page but the generator, while an AI generation runs, waits for the
 * user's go-ahead or is ready to review. It links back to the generator.
 */
export function AiJobIndicator({ phase }: { phase: AiPhase }) {
  if (phase.name === "compose") return null;
  return <IndicatorCard phase={phase} />;
}

function IndicatorCard({ phase }: { phase: Exclude<AiPhase, { name: "compose" }> }) {
  const t = useTranslations("ai");
  const { tone, title, detail } = useIndicatorText(phase);
  const Icon = tone === "ready" ? BadgeCheck : tone === "attention" ? CircleAlert : WandSparkles;
  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 max-w-[calc(100vw-2rem)] animate-pop lg:bottom-6 lg:left-[calc(16rem+1.5rem)]"
    >
      <Link
        href={AI_PAGE}
        aria-label={`${title}. ${detail}. ${t("background.open")}`}
        className={cn(
          "group flex items-center gap-3 rounded-2xl border bg-surface py-2.5 pr-4 pl-2.5 shadow-lg transition-transform",
          "hover:-translate-y-0.5 focus-visible:-translate-y-0.5 active:translate-y-0",
          tone === "attention"
            ? "border-accent"
            : tone === "ready"
              ? "border-success"
              : "border-border",
        )}
      >
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl",
            tone === "ready"
              ? "bg-success text-white"
              : "bg-accent text-on-accent shadow-[0_3px_0_var(--accent-strong)]",
          )}
        >
          <Icon
            className={cn("size-5", tone === "working" && "motion-safe:animate-pulse")}
            aria-hidden
          />
        </span>
        <span className="flex min-w-0 flex-col text-left">
          <span className="truncate text-sm font-bold">{title}</span>
          <span className="truncate text-xs text-muted group-hover:text-text">{detail}</span>
        </span>
      </Link>
    </div>
  );
}
