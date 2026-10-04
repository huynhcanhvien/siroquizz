"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/cn";
import type { LangCode, Side } from "@/lib/types";
import type { Answer, MatchingQuestion } from "../lib/types";

const PAIR_COLORS = [
  "border-primary bg-primary-soft",
  "border-accent-strong bg-accent-soft",
  "border-success bg-success-soft",
  "border-danger bg-danger-soft",
  "border-[oklch(60%_0.13_230)] bg-[oklch(60%_0.13_230/0.12)]",
];

interface MatchingViewProps {
  question: MatchingQuestion;
  answer: Answer | undefined;
  onAnswer: (answer: Answer) => void;
  langs: { termLang: LangCode; definitionLang: LangCode };
}

/** Click a prompt on the left, then its answer on the right. Clicking a linked prompt unlinks it. */
export function MatchingView({ question, answer, onAnswer, langs }: MatchingViewProps) {
  const t = useTranslations("test");
  const [activePrompt, setActivePrompt] = useState<string | null>(null);
  const matches = answer?.type === "matching" ? answer.matches : {};
  const linkedIndex = (cardId: string) =>
    question.pairs.findIndex((pair) => pair.cardId === cardId);
  const answerSide: Side = question.promptSide === "term" ? "definition" : "term";
  const langOf = (side: Side) => (side === "term" ? langs.termLang : langs.definitionLang);

  const setMatches = (next: Record<string, string>) =>
    onAnswer({ type: "matching", matches: next });

  const handlePrompt = (cardId: string) => {
    if (matches[cardId] !== undefined) {
      const { [cardId]: _removed, ...rest } = matches;
      setMatches(rest);
      setActivePrompt(cardId);
      return;
    }
    // Selecting is idempotent: the next open prompt is auto-selected, so a click must never deselect it.
    setActivePrompt(cardId);
  };

  const handleAnswer = (answerCardId: string) => {
    if (!activePrompt) return;
    const withoutAnswer = Object.fromEntries(
      Object.entries(matches).filter(([, value]) => value !== answerCardId),
    );
    setMatches({ ...withoutAnswer, [activePrompt]: answerCardId });
    const nextOpen = question.pairs.find(
      (pair) => pair.cardId !== activePrompt && withoutAnswer[pair.cardId] === undefined,
    );
    setActivePrompt(nextOpen?.cardId ?? null);
  };

  const promptForAnswer = (answerCardId: string) =>
    Object.entries(matches).find(([, value]) => value === answerCardId)?.[0];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t("matchingInstruction")}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <ul className="flex flex-col gap-2">
          {question.pairs.map((pair, index) => {
            const linked = matches[pair.cardId] !== undefined;
            return (
              <li key={pair.cardId}>
                <button
                  type="button"
                  onClick={() => handlePrompt(pair.cardId)}
                  aria-pressed={activePrompt === pair.cardId}
                  aria-label={linked ? t("matchingUnlink", { item: pair.prompt }) : undefined}
                  lang={langOf(question.promptSide)}
                  className={cn(
                    "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-lg border-2 px-3 py-2 text-left font-semibold transition-colors",
                    linked
                      ? PAIR_COLORS[index % PAIR_COLORS.length]
                      : "border-border hover:border-border-strong",
                    activePrompt === pair.cardId && "ring-4 ring-primary/25",
                  )}
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface text-xs font-bold text-muted shadow-sm">
                    {index + 1}
                  </span>
                  <span className="break-words">{pair.prompt}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <ul className="flex flex-col gap-2">
          {question.answers.map((item) => {
            const owner = promptForAnswer(item.cardId);
            const ownerIndex = owner ? linkedIndex(owner) : -1;
            return (
              <li key={item.cardId}>
                <button
                  type="button"
                  onClick={() => handleAnswer(item.cardId)}
                  // aria-disabled (not disabled) keeps keyboard focus when the last pair is linked.
                  aria-disabled={!activePrompt}
                  lang={langOf(answerSide)}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-lg border-2 border-dashed px-3 py-2 text-left transition-colors",
                    activePrompt ? "cursor-pointer" : "cursor-default",
                    ownerIndex >= 0
                      ? cn("border-solid", PAIR_COLORS[ownerIndex % PAIR_COLORS.length])
                      : cn("border-border-strong", activePrompt && "hover:bg-surface-2"),
                  )}
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface text-xs font-bold text-muted shadow-sm">
                    {ownerIndex >= 0 ? ownerIndex + 1 : "·"}
                  </span>
                  <span className="break-words">{item.text}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
