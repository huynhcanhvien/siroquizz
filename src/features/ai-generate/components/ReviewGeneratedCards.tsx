"use client";

import { Info, RotateCcw, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/fields";
import { cn } from "@/lib/cn";
import { StudyDirection } from "@/features/study/components/StudyDirection";
import type { LangCode } from "@/lib/types";
import type { GeneratedCard } from "../lib/generator";

export interface ReviewCard extends GeneratedCard {
  included: boolean;
}

interface ReviewGeneratedCardsProps {
  initialTitle: string;
  termLang?: LangCode;
  definitionLang?: LangCode;
  cards: ReviewCard[];
  onCardsChange: (cards: ReviewCard[]) => void;
  notice: string | null;
  saving: boolean;
  onSave: (title: string) => void;
  onStartOver: () => void;
}

const MIN_CARDS = 2;
const CELL = "h-10 bg-surface text-[0.95rem]";

export function ReviewGeneratedCards({
  initialTitle,
  termLang = "en",
  definitionLang = "vi",
  cards,
  onCardsChange,
  notice,
  saving,
  onSave,
  onStartOver,
}: ReviewGeneratedCardsProps) {
  const t = useTranslations("ai");
  const tEditor = useTranslations("editor");
  const titleId = useId();
  const [title, setTitle] = useState(initialTitle);
  const selected = cards.filter(
    (card) => card.included && card.term.trim() && card.definition.trim(),
  ).length;
  const allIncluded = cards.every((card) => card.included);

  const update = (id: string, patch: Partial<ReviewCard>) =>
    onCardsChange(cards.map((card) => (card.id === id ? { ...card, ...patch } : card)));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-title font-extrabold">{t("reviewTitle")}</h1>
        <p className="mt-1 text-muted">{t("reviewSubtitle")}</p>
        <StudyDirection set={{ termLang, definitionLang }} />
        <p className="mt-2 text-sm text-muted">{t("reviewHint")}</p>
      </div>

      {notice ? (
        <p className="flex items-start gap-2 rounded-lg border border-accent/60 bg-accent-soft px-4 py-3 text-sm font-medium text-on-accent dark:text-accent">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {notice}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={titleId}>{t("setTitle")}</Label>
        <Input
          id={titleId}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="h-12 text-lg font-semibold"
          maxLength={120}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="size-4.5 accent-[var(--primary)]"
            checked={allIncluded}
            onChange={() =>
              onCardsChange(cards.map((card) => ({ ...card, included: !allIncluded })))
            }
          />
          {t("selectAll")}
        </label>
        <span className="text-sm font-bold text-muted" aria-live="polite">
          {t("selectedCount", { count: selected, total: cards.length })}
        </span>
      </div>

      <ol className="flex flex-col gap-2.5">
        {cards.map((card, index) => (
          <li
            key={card.id}
            className={cn(
              "grid grid-cols-[auto_1fr] gap-3 rounded-xl border bg-surface p-3 shadow-sm transition-opacity sm:grid-cols-[auto_1fr_1fr_10rem] sm:items-center",
              card.included ? "border-border" : "border-dashed border-border opacity-55",
            )}
          >
            <input
              type="checkbox"
              checked={card.included}
              onChange={() => update(card.id, { included: !card.included })}
              aria-label={t("includeCard", { number: index + 1 })}
              className="size-4.5 cursor-pointer accent-[var(--primary)] sm:row-span-1"
            />
            <Input
              translate="no"
              lang={termLang}
              aria-label={`${tEditor("term")} ${index + 1}`}
              value={card.term}
              onChange={(event) => update(card.id, { term: event.target.value })}
              className={cn(CELL, "font-semibold")}
            />
            <Input
              translate="no"
              lang={definitionLang}
              aria-label={`${tEditor("definition")} ${index + 1}`}
              value={card.definition}
              onChange={(event) => update(card.id, { definition: event.target.value })}
              className={cn(CELL, "col-start-2 sm:col-start-auto")}
            />
            <Input
              translate="no"
              aria-label={`${tEditor("phonetic")} ${index + 1}`}
              placeholder={tEditor("phonetic")}
              value={card.phonetic ?? ""}
              onChange={(event) => update(card.id, { phonetic: event.target.value })}
              className={cn(CELL, "col-start-2 text-muted sm:col-start-auto")}
            />
          </li>
        ))}
      </ol>

      {selected < MIN_CARDS ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {t("needTwo")}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="ghost" onClick={onStartOver}>
          <RotateCcw className="size-4" aria-hidden />
          {t("startOver")}
        </Button>
        <Button
          size="lg"
          disabled={selected < MIN_CARDS || !title.trim()}
          loading={saving}
          onClick={() => onSave(title)}
        >
          <Save className="size-4" aria-hidden />
          {t("save", { count: selected })}
        </Button>
      </div>
    </div>
  );
}
