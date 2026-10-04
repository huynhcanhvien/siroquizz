"use client";

import { ArrowRight, Eraser, Lightbulb, SkipForward, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useReducer, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SpeakButton } from "@/components/ui/SpeakButton";
import { isTextEntryTarget, refocusWithin } from "@/lib/client-hooks";
import { cn } from "@/lib/cn";
import { shuffle } from "@/lib/random";
import type { Card, StudySet } from "@/lib/types";
import { useGameFlow, useGameRecord, useStopwatch } from "../hooks";
import { formatDuration } from "../lib/best-score";
import { createScrambleRound, roundPoints, SCRAMBLE_ROUNDS, scrambleReducer, type ScrambleRound } from "../lib/scramble";
import { GameIntro, GameResult, StatChip } from "./GameChrome";
import { GAME_META } from "./game-meta";

const TILE_CLASSES =
  "grid min-h-12 min-w-12 cursor-pointer place-items-center rounded-lg border-2 px-3 text-xl font-bold shadow-[0_3px_0_var(--border-strong)] transition-transform active:translate-y-[2px] active:shadow-none";

function useTypingShortcuts(round: ScrambleRound, dispatch: (action: Parameters<typeof scrambleReducer>[1]) => void) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (round.status === "correct" || isTextEntryTarget(event.target)) return;
      if (event.key === "Backspace") {
        const last = round.answer.at(-1);
        if (last) dispatch({ type: "unpick", tileId: last });
        return;
      }
      if (event.key.length !== 1) return;
      const key = event.key.toLocaleLowerCase();
      const tile = round.pool.find((item) => !round.answer.includes(item.id) && item.text.toLocaleLowerCase() === key);
      if (tile) dispatch({ type: "pick", tileId: tile.id });
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [dispatch, round]);
}

interface RoundViewProps {
  card: Card;
  set: StudySet;
  onDone: (points: number) => void;
}

function RoundView({ card, set, onDone }: RoundViewProps) {
  const t = useTranslations("games.scramble");
  const [round, dispatch] = useReducer(scrambleReducer, card, (value) => createScrambleRound(value));
  const nextRef = useRef<HTMLButtonElement>(null);
  const poolRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  useTypingShortcuts(round, dispatch);

  // Picked tiles become invisible and unpicked ones disappear, so keep keyboard focus on a usable tile.
  const pick = (tileId: string) => {
    dispatch({ type: "pick", tileId });
    refocusWithin(poolRef.current);
  };
  const unpick = (tileId: string) => {
    dispatch({ type: "unpick", tileId });
    refocusWithin(answerRef.current?.querySelector("button") ? answerRef.current : poolRef.current);
  };

  useEffect(() => {
    if (round.status === "correct") nextRef.current?.focus();
  }, [round.status]);

  const tileText = (id: string) => round.pool.find((tile) => tile.id === id)?.text ?? "";
  const solved = round.status === "correct";

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-border bg-surface p-5 text-center shadow-sm">
        <p className="text-xs font-bold tracking-wider text-subtle uppercase">{t("clue")}</p>
        <div className="mt-2 flex items-center justify-center gap-2">
          <p lang={set.definitionLang} className="text-xl font-semibold break-words">
            {card.definition}
          </p>
          <SpeakButton text={card.definition} lang={set.definitionLang} />
        </div>
      </div>

      <div
        ref={answerRef}
        aria-label={t("answerArea")}
        role="group"
        className={cn(
          "flex min-h-20 flex-wrap items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 transition-colors",
          solved ? "border-success bg-success-soft" : round.status === "wrong" ? "animate-shake border-danger bg-danger-soft" : "border-border-strong",
        )}
      >
        {round.answer.map((id) => (
          <button
            key={id}
            type="button"
            lang={set.termLang}
            onClick={() => unpick(id)}
            className={cn(TILE_CLASSES, "border-primary bg-primary-soft")}
          >
            {tileText(id)}
          </button>
        ))}
      </div>

      <p aria-live="polite" className={cn("min-h-6 text-center font-bold", solved ? "text-success" : "text-danger")}>
        {solved ? t("correct") : round.status === "wrong" ? t("wrong") : ""}
      </p>

      <div ref={poolRef} role="group" aria-label={t("pool")} className="flex flex-wrap justify-center gap-2">
        {round.pool.map((tile) => {
          const used = round.answer.includes(tile.id);
          return (
            <button
              key={tile.id}
              type="button"
              lang={set.termLang}
              disabled={used || solved}
              onClick={() => pick(tile.id)}
              className={cn(TILE_CLASSES, "border-border-strong bg-surface hover:-translate-y-0.5", used && "invisible")}
            >
              {tile.text}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {solved ? (
          <Button ref={nextRef} size="lg" onClick={() => onDone(roundPoints(round.hintsUsed))}>
            {t("next")}
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        ) : (
          <>
            <Button variant="soft" onClick={() => dispatch({ type: "hint" })}>
              <Lightbulb className="size-4" aria-hidden />
              {t("hint")}
            </Button>
            <Button variant="secondary" onClick={() => dispatch({ type: "clear" })}>
              <Eraser className="size-4" aria-hidden />
              {t("clear")}
            </Button>
            <Button variant="ghost" onClick={() => onDone(0)}>
              <SkipForward className="size-4" aria-hidden />
              {t("skip")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function ScrambleBoard({ set, onFinish }: { set: StudySet; onFinish: (score: number, timeMs: number) => void }) {
  const t = useTranslations("games");
  // Random once per board; useMemo may recompute, a lazy state initializer never does.
  const [rounds] = useState(() => shuffle(set.cards).slice(0, SCRAMBLE_ROUNDS));
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const { read } = useStopwatch(true);

  const handleDone = (points: number) => {
    const total = score + points;
    setScore(total);
    if (index + 1 >= rounds.length) onFinish(total, read());
    else setIndex(index + 1);
  };

  const card = rounds[index];
  if (!card) return null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <StatChip value={t("scramble.round", { current: index + 1, total: rounds.length })} />
        <StatChip icon={Star} label={t("score")} value={score} />
      </div>
      <RoundView key={card.id} card={card} set={set} onDone={handleDone} />
    </div>
  );
}

export function ScrambleGame({ set }: { set: StudySet }) {
  const t = useTranslations("games");
  const { best, record } = useGameRecord(set.id, "scramble");
  const { phase, start, finish } = useGameFlow();

  if (phase.name === "intro") return <GameIntro game="scramble" icon={GAME_META.scramble.icon} best={best} onStart={start} />;

  if (phase.name === "done") {
    return (
      <GameResult
        title={t("finished")}
        game="scramble"
        setId={set.id}
        isRecord={phase.outcome.isRecord}
        onPlayAgain={start}
        stats={[
          { label: t("score"), value: phase.outcome.score },
          { label: t("time"), value: formatDuration(phase.outcome.timeMs) },
        ]}
      />
    );
  }

  return <ScrambleBoard key={phase.round} set={set} onFinish={(score, timeMs) => finish(record({ score, timeMs }), undefined)} />;
}
