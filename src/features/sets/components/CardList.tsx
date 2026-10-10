"use client";

import { useTranslations } from "next-intl";
import { SpeakButton } from "@/components/ui/SpeakButton";
import { useSetProgress } from "@/features/progress/hooks";
import { CardImage } from "@/features/srs/components/CardImage";
import { CardImageEditor } from "@/features/srs/components/CardImageEditor";
import { StarButton } from "@/features/srs/components/StarButton";
import { cn } from "@/lib/cn";
import type { Side, StudySet } from "@/lib/types";
import { StudyDirection } from "@/features/study/components/StudyDirection";
import { PhoneticSideButton } from "./PhoneticSideButton";

const STATUS_DOT = {
  known: "bg-success",
  learning: "bg-accent",
  new: "bg-surface-3 ring-1 ring-border-strong",
} as const;

export function CardList({
  set,
  editable = true,
  phoneticSide = "term",
  onPhoneticSideChange,
}: {
  set: StudySet;
  editable?: boolean;
  phoneticSide?: Side;
  onPhoneticSideChange?: (side: Side) => void;
}) {
  const t = useTranslations("set");
  const { data: progress = [] } = useSetProgress(set.id);
  const statusByCard = new Map(progress.map((item) => [item.cardId, item.status]));

  return (
    <section aria-labelledby="cards-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="cards-title" className="text-xl font-bold">
          {t("cardsTitle", { count: set.cards.length })}
        </h2>
        {onPhoneticSideChange && set.cards.some((card) => card.phonetic) ? (
          <PhoneticSideButton side={phoneticSide} onSideChange={onPhoneticSideChange} />
        ) : null}
      </div>
      <StudyDirection set={set} />
      <ul className="flex flex-col gap-2.5">
        {set.cards.map((card) => {
          const status = statusByCard.get(card.id) ?? "new";
          return (
            <li
              key={card.id}
              className="grid gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] sm:items-center sm:gap-6"
            >
              <div className="flex items-start gap-3 sm:border-r sm:border-border sm:pr-6">
                <span
                  className={cn("mt-2 size-2 shrink-0 rounded-full", STATUS_DOT[status])}
                  title={t(status)}
                  aria-label={t(status)}
                  role="img"
                />
                <div className="min-w-0 flex-1">
                  <p translate="no" lang={set.termLang} className="font-semibold break-words">
                    {card.term}
                  </p>
                  {phoneticSide === "term" && card.phonetic ? (
                    <p translate="no" className="text-sm break-words text-muted">
                      {card.phonetic}
                    </p>
                  ) : null}
                </div>
                <StarButton setId={set.id} cardId={card.id} />
                <SpeakButton text={card.term} lang={set.termLang} className="-my-1" />
              </div>
              <div className="flex items-start gap-3 pl-5 sm:pl-0">
                <div className="min-w-0 flex-1">
                  <p
                    translate="no"
                    lang={set.definitionLang}
                    className="break-words whitespace-pre-line"
                  >
                    {card.definition}
                  </p>
                  {phoneticSide === "definition" && card.phonetic ? (
                    <p translate="no" className="text-sm break-words text-muted">
                      {card.phonetic}
                    </p>
                  ) : null}
                </div>
                <CardImage card={card} />
                {editable ? <CardImageEditor setId={set.id} cardId={card.id} /> : null}
                <SpeakButton text={card.definition} lang={set.definitionLang} className="-my-1" />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
