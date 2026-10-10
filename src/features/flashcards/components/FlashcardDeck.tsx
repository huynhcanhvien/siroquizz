"use client";

import { ChevronLeft, ChevronRight, Keyboard, RefreshCw, Shuffle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/misc";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { useSaveCardStatus } from "@/features/progress/hooks";
import { PhoneticSideButton } from "@/features/sets/components/PhoneticSideButton";
import { useSetPhoneticSide } from "@/features/sets/use-set-phonetic-side";
import { isActivatableTarget, isTextEntryTarget } from "@/lib/client-hooks";
import { shuffle } from "@/lib/random";
import type { Side, StudySet } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-messages";
import { createDeck, currentCardId, deckReducer, type DeckAction } from "../lib/deck";
import { DeckSummary } from "./DeckSummary";
import { Flashcard } from "./Flashcard";

type Mark = "known" | "learning";

interface DeckKeyHandlers {
  dispatch: (action: DeckAction) => void;
  mark: (status: Mark) => void;
  trackProgress: boolean;
}

/**
 * Space/↑/↓ flip. With progress tracking ← / 1 = still learning and → / 2 = know (like Quizlet);
 * without tracking ←/→ navigate. Space and Enter yield to a focused button, link or <summary>.
 */
function useDeckKeyboard(handlers: DeckKeyHandlers) {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTextEntryTarget(event.target)
      )
        return;
      if ((event.key === " " || event.key === "Enter") && isActivatableTarget(event.target)) return;
      const { dispatch, mark, trackProgress } = handlersRef.current;
      const actions: Record<string, () => void> = {
        " ": () => dispatch({ type: "flip" }),
        ArrowUp: () => dispatch({ type: "flip" }),
        ArrowDown: () => dispatch({ type: "flip" }),
        ArrowRight: () => (trackProgress ? mark("known") : dispatch({ type: "next" })),
        ArrowLeft: () => (trackProgress ? mark("learning") : dispatch({ type: "prev" })),
        "1": () => trackProgress && mark("learning"),
        "2": () => trackProgress && mark("known"),
      };
      const action = actions[event.key];
      if (!action) return;
      event.preventDefault();
      // Holding a key must not race through the deck.
      if (!event.repeat) action();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);
}

function TrackedControls({
  onMark,
  onFlip,
}: {
  onMark: (status: Mark) => void;
  onFlip: () => void;
}) {
  const t = useTranslations("flashcards");
  const markClasses = "min-w-0 px-3 whitespace-normal sm:px-6";
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <Button
        variant="secondary"
        size="lg"
        onClick={() => onMark("learning")}
        className={`${markClasses} border-accent text-on-accent shadow-[0_2px_0_var(--accent-strong)] dark:text-accent`}
      >
        <ChevronLeft className="hidden size-5 sm:block" aria-hidden />
        {t("learning")}
      </Button>
      <Button variant="ghost" size="icon" onClick={onFlip} aria-label={t("flip")}>
        <RefreshCw className="size-5" aria-hidden />
      </Button>
      <Button
        variant="secondary"
        size="lg"
        onClick={() => onMark("known")}
        className={`${markClasses} border-success text-success shadow-[0_2px_0_var(--success)]`}
      >
        {t("known")}
        <ChevronRight className="hidden size-5 sm:block" aria-hidden />
      </Button>
    </div>
  );
}

function BrowseControls({
  dispatch,
  isFirst,
}: {
  dispatch: (action: DeckAction) => void;
  isFirst: boolean;
}) {
  const t = useTranslations("flashcards");
  return (
    <div className="flex items-center justify-center gap-4">
      <Button
        variant="secondary"
        size="icon"
        onClick={() => dispatch({ type: "prev" })}
        disabled={isFirst}
        aria-label={t("prev")}
      >
        <ChevronLeft className="size-5" aria-hidden />
      </Button>
      <Button variant="soft" onClick={() => dispatch({ type: "flip" })}>
        <RefreshCw className="size-4" aria-hidden />
        {t("flip")}
      </Button>
      <Button
        variant="secondary"
        size="icon"
        onClick={() => dispatch({ type: "next" })}
        aria-label={t("next")}
      >
        <ChevronRight className="size-5" aria-hidden />
      </Button>
    </div>
  );
}

interface DeckOptionsProps {
  frontSide: Side;
  onFrontSideChange: (side: Side) => void;
  trackProgress: boolean;
  onTrackProgressChange: (value: boolean) => void;
  onShuffle: () => void;
}

function DeckOptions({
  frontSide,
  onFrontSideChange,
  trackProgress,
  onTrackProgressChange,
  onShuffle,
}: DeckOptionsProps) {
  const t = useTranslations("flashcards");
  return (
    <details className="group rounded-xl border border-border bg-surface p-4 shadow-sm">
      <summary className="cursor-pointer font-semibold">{t("options")}</summary>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <SegmentedControl
          label={t("frontSide")}
          value={frontSide}
          onChange={onFrontSideChange}
          options={[
            { value: "term", label: t("frontTerm") },
            { value: "definition", label: t("frontDefinition") },
          ]}
        />
        <Switch
          checked={trackProgress}
          onCheckedChange={onTrackProgressChange}
          label={t("trackProgress")}
          className="sm:pb-2"
        />
        <Button variant="secondary" size="sm" className="sm:mb-1" onClick={onShuffle}>
          <Shuffle className="size-4" aria-hidden />
          {t("shuffle")}
        </Button>
      </div>
      <p className="mt-4 flex items-start gap-2 text-sm text-muted">
        <Keyboard className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t("shortcuts")}
      </p>
    </details>
  );
}

function PileCounters({ learning, known }: { learning: number; known: number }) {
  const t = useTranslations("flashcards");
  return (
    <div className="flex justify-between text-sm font-bold" aria-live="polite">
      <span className="rounded-full bg-accent-soft px-3 py-1 text-on-accent dark:text-accent">
        {t("learning")} · {learning}
      </span>
      <span className="rounded-full bg-success-soft px-3 py-1 text-success">
        {t("known")} · {known}
      </span>
    </div>
  );
}

/**
 * `practice` studies without saving card statuses, for sessions that merge several sets (a whole
 * folder), where a status has no single set to belong to.
 */
export function FlashcardDeck({ set, practice = false }: { set: StudySet; practice?: boolean }) {
  const t = useTranslations("flashcards");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const cardIds = useMemo(() => set.cards.map((card) => card.id), [set.cards]);
  const cardsById = useMemo(() => new Map(set.cards.map((card) => [card.id, card])), [set.cards]);
  const [state, dispatch] = useReducer(deckReducer, cardIds, createDeck);
  const [frontSide, setFrontSide] = useState<Side>("term");
  const { phoneticSide, setPhoneticSide } = useSetPhoneticSide(practice ? null : set.id);
  const [trackProgress, setTrackProgress] = useState(true);
  const { mutate: saveCardStatus } = useSaveCardStatus(set.id);
  const card = cardsById.get(currentCardId(state) ?? "");

  const mark = (status: Mark) => {
    const id = currentCardId(state);
    if (!id || state.finished) return;
    if (!practice)
      saveCardStatus(
        { cardId: id, status },
        { onError: (error) => toast(errorMessage(error), "error") },
      );
    dispatch({ type: "mark", status });
  };

  useDeckKeyboard({ dispatch, mark, trackProgress });

  if (state.finished) {
    return (
      <DeckSummary
        known={state.known.length}
        learning={state.learning}
        total={state.order.length}
        trackProgress={trackProgress}
        setId={set.id}
        onRestudy={(ids) => dispatch({ type: "restart", cardIds: ids })}
        onRestart={() => dispatch({ type: "restart", cardIds })}
        onPrevious={() => dispatch({ type: "prev" })}
      />
    );
  }

  if (!card) return null;
  const counter = tCommon("counter", { current: state.index + 1, total: state.order.length });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex items-center gap-4">
        <ProgressBar
          value={state.index + 1}
          max={state.order.length}
          label={counter}
          className="flex-1"
        />
        <span className="text-sm font-bold text-muted tabular-nums">{counter}</span>
      </div>
      {trackProgress ? (
        <PileCounters learning={state.learning.length} known={state.known.length} />
      ) : null}
      {!practice && set.cards.some((card) => card.phonetic) ? (
        <div className="flex justify-end">
          <PhoneticSideButton side={phoneticSide} onSideChange={setPhoneticSide} />
        </div>
      ) : null}
      <Flashcard
        key={card.id}
        card={card}
        frontSide={frontSide}
        phoneticSide={phoneticSide}
        flipped={state.flipped}
        onFlip={() => dispatch({ type: "flip" })}
        termLang={set.termLang}
        definitionLang={set.definitionLang}
        className="h-[min(56vh,26rem)] animate-pop"
      />
      <p className="text-center text-sm text-muted">{t("hint")}</p>
      {trackProgress ? (
        <div className="flex flex-col gap-3">
          <TrackedControls onMark={mark} onFlip={() => dispatch({ type: "flip" })} />
          <Button
            variant="ghost"
            className="self-center"
            disabled={state.index === 0}
            onClick={() => dispatch({ type: "prev" })}
          >
            <ChevronLeft className="size-4" aria-hidden />
            {t("prev")}
          </Button>
        </div>
      ) : (
        <BrowseControls dispatch={dispatch} isFirst={state.index === 0} />
      )}
      <DeckOptions
        frontSide={frontSide}
        onFrontSideChange={setFrontSide}
        trackProgress={trackProgress}
        onTrackProgressChange={setTrackProgress}
        onShuffle={() => dispatch({ type: "restart", cardIds: shuffle(cardIds) })}
      />
    </div>
  );
}
