"use client";

import { Footprints, Timer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useReducer, useRef } from "react";
import { refocusWithin, useOnceWhen } from "@/lib/client-hooks";
import { cn } from "@/lib/cn";
import type { StudySet } from "@/lib/types";
import { useGameFlow, useGameRecord, useStopwatch } from "../hooks";
import { formatDuration } from "../lib/best-score";
import { createMemoryBoard, memoryReducer, MISMATCH_HIDE_DELAY_MS } from "../lib/memory";
import { GameIntro, GameResult, StatChip } from "./GameChrome";
import { GAME_META } from "./game-meta";

function MemoryBoard({
  set,
  onFinish,
}: {
  set: StudySet;
  onFinish: (timeMs: number, moves: number) => void;
}) {
  const t = useTranslations("games");
  const [state, dispatch] = useReducer(memoryReducer, set.cards, createMemoryBoard);
  const { elapsed, read } = useStopwatch(!state.finished);
  const gridRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!state.locked) return;
    const timer = window.setTimeout(() => dispatch({ type: "hide" }), MISMATCH_HIDE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [state.locked]);

  useOnceWhen(state.finished, () => onFinish(read(), state.moves));

  const flip = (id: string) => {
    dispatch({ type: "flip", id });
    refocusWithin(gridRef.current);
  };

  const langOf = (side: "term" | "definition") =>
    side === "term" ? set.termLang : set.definitionLang;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <StatChip icon={Timer} label={t("time")} value={formatDuration(elapsed)} />
        <StatChip icon={Footprints} label={t("moves")} value={state.moves} />
        <div aria-live="polite">
          <StatChip
            value={t("pairs", {
              found: state.matchedIds.length / 2,
              total: state.cards.length / 2,
            })}
          />
        </div>
      </div>
      <ul ref={gridRef} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {state.cards.map((card, index) => {
          const matched = state.matchedIds.includes(card.id);
          const faceUp = matched || state.flippedIds.includes(card.id);
          return (
            <li key={card.id}>
              <button
                type="button"
                onClick={() => flip(card.id)}
                disabled={matched}
                onKeyDown={(event) => {
                  if (faceUp && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
                    event.preventDefault();
                    event.currentTarget
                      .querySelector<HTMLElement>("[data-card-face]")
                      ?.scrollBy({ top: event.key === "ArrowDown" ? 48 : -48 });
                  }
                }}
                aria-label={
                  faceUp
                    ? card.text
                    : `${t("memory.cardLabel", { number: index + 1 })}, ${t("memory.hidden")}`
                }
                className="block h-28 w-full cursor-pointer rounded-lg flip-scene sm:h-32"
              >
                <span className={cn("flip-inner block size-full", faceUp && "is-flipped")}>
                  <span
                    aria-hidden
                    className="flip-front flip-face grid place-items-center rounded-lg bg-primary [background-image:radial-gradient(oklch(100%_0_0/0.18)_1.5px,transparent_1.6px)] [background-size:14px_14px] text-on-primary shadow-[0_4px_0_var(--primary-press)]"
                  >
                    <span className="grid size-10 place-items-center rounded-full bg-on-primary/15 text-lg font-extrabold">
                      ?
                    </span>
                  </span>
                  <span
                    data-card-face
                    aria-hidden
                    translate="no"
                    lang={langOf(card.side)}
                    className={cn(
                      "flip-face flex flip-back items-start justify-center overflow-y-auto rounded-lg border-2 bg-surface p-3 text-center font-semibold break-words shadow-sm",
                      matched ? "border-success bg-success-soft" : "border-primary",
                    )}
                  >
                    <span translate="no" className="min-w-0 [overflow-wrap:anywhere]">
                      {card.text}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function MemoryGame({ set }: { set: StudySet }) {
  const t = useTranslations("games");
  const { best, record } = useGameRecord(set.id, "memory");
  const { phase, start, finish } = useGameFlow<{ moves: number }>();

  if (phase.name === "intro")
    return <GameIntro game="memory" icon={GAME_META.memory.icon} best={best} onStart={start} />;

  if (phase.name === "done") {
    return (
      <GameResult
        title={t("finished")}
        game="memory"
        setId={set.id}
        isRecord={phase.outcome.isRecord}
        onPlayAgain={start}
        stats={[
          { label: t("time"), value: formatDuration(phase.outcome.timeMs) },
          { label: t("moves"), value: phase.details.moves },
        ]}
      />
    );
  }

  return (
    <MemoryBoard
      key={phase.round}
      set={set}
      onFinish={(timeMs, moves) => finish(record({ score: moves, timeMs }), { moves })}
    />
  );
}
