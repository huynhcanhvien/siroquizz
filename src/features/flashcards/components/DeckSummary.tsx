"use client";

import { PartyPopper, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/misc";

interface DeckSummaryProps {
  known: number;
  learning: string[];
  total: number;
  trackProgress: boolean;
  setId: string;
  onRestudy: (cardIds: string[]) => void;
  onRestart: () => void;
}

export function DeckSummary({ known, learning, total, trackProgress, setId, onRestudy, onRestart }: DeckSummaryProps) {
  const t = useTranslations("flashcards");
  return (
    <div className="mx-auto flex w-full max-w-xl animate-pop flex-col items-center gap-6 rounded-xl border border-border bg-surface p-8 text-center shadow-lg sm:p-10">
      <span className="grid size-16 place-items-center rounded-2xl bg-accent text-on-accent shadow-[0_4px_0_var(--accent-strong)]">
        <PartyPopper className="size-8" aria-hidden />
      </span>
      <div>
        <h1 className="text-title font-extrabold">{t("summaryTitle")}</h1>
        <p className="mt-2 text-lg text-muted">
          {trackProgress ? t("summaryBody", { known, learning: learning.length }) : t("reviewedAll", { count: total })}
        </p>
      </div>
      {trackProgress ? <ProgressBar value={known} max={total} label={t("known")} tone="success" className="h-3 w-full" /> : null}
      <div className="flex w-full flex-col gap-3">
        {trackProgress && learning.length > 0 ? (
          <Button size="lg" onClick={() => onRestudy(learning)}>
            {t("restudy", { count: learning.length })}
          </Button>
        ) : null}
        <Button variant="secondary" size="lg" onClick={onRestart}>
          <RotateCcw className="size-4" aria-hidden />
          {t("restart")}
        </Button>
        <Button asChild variant="ghost">
          <Link href={`/sets/${setId}`}>{t("backToSet")}</Link>
        </Button>
      </div>
    </div>
  );
}
