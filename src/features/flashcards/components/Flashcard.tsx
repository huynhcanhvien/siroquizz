"use client";

import { CardImage } from "@/features/srs/components/CardImage";
import { SpeakButton } from "@/components/ui/SpeakButton";
import { cn } from "@/lib/cn";
import type { Card, LangCode, Side } from "@/lib/types";

interface FlashcardProps {
  card: Card;
  frontSide: Side;
  phoneticSide?: Side;
  flipped: boolean;
  onFlip: () => void;
  termLang: LangCode;
  definitionLang: LangCode;
  size?: "md" | "lg";
  className?: string;
}

function textSize(text: string, size: "md" | "lg") {
  const length = Array.from(text).length;
  if (size === "md") return length > 80 ? "text-lg" : length > 30 ? "text-2xl" : "text-3xl";
  if (length > 160) return "text-xl";
  if (length > 70) return "text-2xl sm:text-3xl";
  if (length > 24) return "text-3xl sm:text-4xl";
  return "text-4xl sm:text-5xl";
}

function Face({
  side,
  phoneticSide,
  card,
  lang,
  size,
  hidden,
  className,
}: {
  side: Side;
  phoneticSide: Side;
  card: Card;
  lang: LangCode;
  size: "md" | "lg";
  hidden: boolean;
  className?: string;
}) {
  const text = side === "term" ? card.term : card.definition;
  return (
    <div
      aria-hidden={hidden}
      inert={hidden}
      className={cn(
        "flip-face flex flex-col rounded-xl border border-border bg-surface p-5 shadow-lg sm:p-8",
        side === "term" ? "" : "bg-[color-mix(in_oklch,var(--surface)_92%,var(--primary-soft))]",
        className,
      )}
    >
      <div className="flex justify-end">
        <SpeakButton text={text} lang={lang} />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto px-2 text-center">
        <p
          translate="no"
          lang={lang}
          className={cn("font-bold break-words whitespace-pre-line", textSize(text, size))}
        >
          {text}
        </p>
        {side === phoneticSide && card.phonetic ? (
          <p translate="no" className="text-lg break-words text-muted">
            {card.phonetic}
          </p>
        ) : null}
        {side === "definition" ? <CardImage card={card} /> : null}
      </div>
    </div>
  );
}

/**
 * Big 3D flip card. Clicking flips it; keyboard users flip with Space or the deck's flip button,
 * so the card itself is not a button (it contains the speak buttons).
 * Falls back to a crossfade when the user prefers reduced motion (see globals.css).
 */
export function Flashcard({
  card,
  frontSide,
  phoneticSide = "term",
  flipped,
  onFlip,
  termLang,
  definitionLang,
  size = "lg",
  className,
}: FlashcardProps) {
  const backSide: Side = frontSide === "term" ? "definition" : "term";
  const langOf = (side: Side) => (side === "term" ? termLang : definitionLang);

  return (
    <div
      onClick={onFlip}
      className={cn("relative w-full cursor-pointer rounded-xl flip-scene", className)}
    >
      <div className={cn("flip-inner size-full", flipped && "is-flipped")}>
        <Face
          side={frontSide}
          phoneticSide={phoneticSide}
          card={card}
          lang={langOf(frontSide)}
          size={size}
          hidden={flipped}
          className="flip-front"
        />
        <Face
          side={backSide}
          phoneticSide={phoneticSide}
          card={card}
          lang={langOf(backSide)}
          size={size}
          hidden={!flipped}
          className="flip-back"
        />
      </div>
    </div>
  );
}
