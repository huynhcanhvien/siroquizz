"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/cn";

/** Interactive hero card: the product's core gesture, flipping a flashcard. */
export function DemoFlashcard() {
  const t = useTranslations("landing");
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="relative mx-auto w-[calc(100%-1.5rem)] max-w-md sm:w-full">
      <div aria-hidden className="absolute inset-0 translate-x-3 translate-y-4 rotate-[5deg] rounded-xl bg-accent shadow-md sm:translate-x-6 sm:translate-y-6 sm:rotate-[7deg]" />
      <div aria-hidden className="absolute inset-0 translate-x-1.5 translate-y-2 rotate-[2deg] rounded-xl border border-border bg-surface-3 sm:translate-x-3 sm:translate-y-3 sm:rotate-[3deg]" />
      <button
        type="button"
        onClick={() => setFlipped((value) => !value)}
        aria-pressed={flipped}
        aria-label={`${t("demoHint")}: ${flipped ? t("demoBack") : t("demoFront")}`}
        className="flip-scene relative block aspect-[5/4] w-full cursor-pointer rounded-xl"
      >
        <span className={cn("flip-inner block size-full", flipped && "is-flipped")}>
          <span className="flip-face flip-front flex flex-col items-center justify-center rounded-xl border border-border bg-surface shadow-lg">
            <span className="text-xs font-bold tracking-[0.2em] text-subtle uppercase">EN</span>
            <span className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">{t("demoFront")}</span>
            <span className="mt-2 text-muted">/ˌserənˈdɪpəti/</span>
          </span>
          <span className="flip-face flip-back flex flex-col items-center justify-center rounded-xl bg-primary text-on-primary shadow-lg">
            <span className="text-xs font-bold tracking-[0.2em] text-white/90 uppercase">VI</span>
            <span className="mt-3 px-6 text-center text-3xl font-extrabold sm:text-4xl">{t("demoBack")}</span>
          </span>
        </span>
      </button>
      <p className="mt-10 flex items-center justify-center gap-2 text-sm font-medium text-muted">
        <RefreshCw className="size-4" aria-hidden />
        {t("demoHint")}
      </p>
    </div>
  );
}
