"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/misc";
import { Flashcard } from "@/features/flashcards/components/Flashcard";
import { isActivatableTarget, isTextEntryTarget } from "@/lib/client-hooks";
import type { Card, LangCode } from "@/lib/types";

/**
 * Flip-through flashcards for anyone opening a shared link, guests included. Nothing is saved;
 * signed-in study modes keep progress.
 */
export function PublicFlashcards({
  cards,
  termLang,
  definitionLang,
}: {
  cards: Card[];
  termLang: LangCode;
  definitionLang: LangCode;
}) {
  const t = useTranslations("community");
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const go = (step: number) => {
    setFlipped(false);
    setIndex((current) => Math.min(cards.length - 1, Math.max(0, current + step)));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTextEntryTarget(event.target) || event.repeat) return;
      if (event.key === " " && !isActivatableTarget(event.target)) {
        event.preventDefault();
        setFlipped((value) => !value);
      } else if (event.key === "ArrowRight") go(1);
      else if (event.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const card = cards[index];
  if (!card) return null;
  return (
    <div className="flex flex-col gap-4">
      <Flashcard
        card={card}
        frontSide="term"
        flipped={flipped}
        onFlip={() => setFlipped((value) => !value)}
        termLang={termLang}
        definitionLang={definitionLang}
        className="h-64 sm:h-80"
      />
      <p className="text-center text-sm text-muted">{t("flipHint")}</p>
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          size="icon-sm"
          className="size-10"
          onClick={() => go(-1)}
          disabled={index === 0}
          aria-label={t("previous")}
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Button>
        <ProgressBar
          value={index + 1}
          max={cards.length}
          label={t("cardOf", { current: index + 1, total: cards.length })}
          className="flex-1"
        />
        <span aria-live="polite" className="min-w-16 text-center text-sm font-bold tabular-nums">
          {index + 1}/{cards.length}
        </span>
        <Button
          variant="secondary"
          size="icon-sm"
          className="size-10"
          onClick={() => go(1)}
          disabled={index === cards.length - 1}
          aria-label={t("next")}
        >
          <ChevronRight className="size-5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
