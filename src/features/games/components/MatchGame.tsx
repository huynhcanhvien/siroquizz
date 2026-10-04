"use client";

import { Timer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useReducer, useRef } from "react";
import { refocusWithin, useOnceWhen } from "@/lib/client-hooks";
import { cn } from "@/lib/cn";
import type { StudySet } from "@/lib/types";
import { useGameFlow, useGameRecord, useStopwatch, type GameOutcome } from "../hooks";
import { formatDuration } from "../lib/best-score";
import { createMatchBoard, matchReducer } from "../lib/match";
import { GameIntro, GameResult, StatChip } from "./GameChrome";
import { GAME_META } from "./game-meta";

const WRONG_FLASH_MS = 450;

function MatchBoard({ set, onFinish }: { set: StudySet; onFinish: (timeMs: number, pairs: number) => void }) {
  const t = useTranslations("games");
  const [state, dispatch] = useReducer(matchReducer, set.cards, createMatchBoard);
  const { elapsed, read } = useStopwatch(!state.finished);
  const gridRef = useRef<HTMLUListElement>(null);
  const pairs = state.tiles.length / 2;

  useEffect(() => {
    if (state.wrongIds.length === 0) return;
    const timer = window.setTimeout(() => dispatch({ type: "clearWrong" }), WRONG_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [state.wrongIds]);

  useOnceWhen(state.finished, () => onFinish(read() + state.penaltyMs, pairs));

  const select = (tileId: string) => {
    dispatch({ type: "select", tileId });
    refocusWithin(gridRef.current);
  };

  const langOf = (side: "term" | "definition") => (side === "term" ? set.termLang : set.definitionLang);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <StatChip icon={Timer} label={t("time")} value={formatDuration(elapsed + state.penaltyMs)} />
        <div aria-live="polite">
          <StatChip value={t("pairs", { found: state.matchedIds.length / 2, total: pairs })} />
        </div>
        {state.penaltyMs > 0 ? (
          <span key={state.penaltyMs} className="animate-pop rounded-full bg-danger-soft px-3 py-1 text-sm font-bold text-danger">
            {t("match.penalty")}
          </span>
        ) : null}
      </div>
      <ul ref={gridRef} className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {state.tiles.map((tile) => {
          const matched = state.matchedIds.includes(tile.id);
          const selected = state.selectedId === tile.id;
          const wrong = state.wrongIds.includes(tile.id);
          return (
            <li key={tile.id}>
              <button
                type="button"
                disabled={matched}
                aria-hidden={matched || undefined}
                aria-pressed={selected}
                lang={langOf(tile.side)}
                onClick={() => select(tile.id)}
                className={cn(
                  "flex h-28 w-full cursor-pointer items-center justify-center rounded-lg border-2 bg-surface p-3 text-center font-semibold break-words shadow-sm transition-[transform,opacity,border-color,background-color] duration-200 sm:h-32",
                  "hover:-translate-y-0.5 hover:shadow-md",
                  selected && "border-primary bg-primary-soft",
                  wrong && "animate-shake border-danger bg-danger-soft",
                  !selected && !wrong && "border-border",
                  matched && "pointer-events-none scale-90 opacity-0",
                )}
              >
                <span className="line-clamp-4">{tile.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function MatchGame({ set }: { set: StudySet }) {
  const t = useTranslations("games");
  const { best, record } = useGameRecord(set.id, "match");
  const { phase, start, finish } = useGameFlow<{ pairs: number }>();

  if (phase.name === "intro") return <GameIntro game="match" icon={GAME_META.match.icon} best={best} onStart={start} />;

  if (phase.name === "done") {
    const { outcome, details } = phase;
    return (
      <GameResult
        title={t("finished")}
        game="match"
        setId={set.id}
        isRecord={outcome.isRecord}
        onPlayAgain={start}
        stats={[
          { label: t("time"), value: formatDuration(outcome.timeMs) },
          { label: t("pairsLabel"), value: details.pairs },
        ]}
      />
    );
  }

  const handleFinish = (timeMs: number, pairs: number) => {
    const outcome: GameOutcome = record({ score: pairs, timeMs });
    finish(outcome, { pairs });
  };

  return <MatchBoard key={phase.round} set={set} onFinish={handleFinish} />;
}
