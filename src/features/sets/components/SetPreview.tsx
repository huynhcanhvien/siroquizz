"use client";

import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Flashcard } from "@/features/flashcards/components/Flashcard";
import type { Side, StudySet } from "@/lib/types";

/** Inline flashcard carousel on the set page, like Quizlet's quick preview. */
export function SetPreview({ set, phoneticSide = "term" }: { set: StudySet; phoneticSide?: Side }) {
  const t = useTranslations("flashcards");
  const tCommon = useTranslations("common");
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = set.cards[index];
  if (!card) return null;

  const go = (offset: number) => {
    setIndex((value) => Math.min(set.cards.length - 1, Math.max(0, value + offset)));
    setFlipped(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <Flashcard
        card={card}
        frontSide="term"
        phoneticSide={phoneticSide}
        flipped={flipped}
        onFlip={() => setFlipped((value) => !value)}
        termLang={set.termLang}
        definitionLang={set.definitionLang}
        size="md"
        className="h-64 sm:h-72"
      />
      <div className="flex items-center justify-center gap-3">
        <Button
          variant="secondary"
          size="icon"
          onClick={() => go(-1)}
          disabled={index === 0}
          aria-label={t("prev")}
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Button>
        <span className="min-w-16 text-center font-bold tabular-nums" aria-live="polite">
          {tCommon("counter", { current: index + 1, total: set.cards.length })}
        </span>
        <Button
          variant="secondary"
          size="icon"
          onClick={() => go(1)}
          disabled={index === set.cards.length - 1}
          aria-label={t("next")}
        >
          <ChevronRight className="size-5" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setFlipped((value) => !value)}
          aria-label={t("flip")}
        >
          <RefreshCw className="size-4.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
