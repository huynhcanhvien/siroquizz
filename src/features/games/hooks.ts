"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { useGameScores, useSaveGameScore } from "@/features/progress/hooks";
import type { GameKind, GameScore } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-messages";
import { bestScore, isNewRecord } from "./lib/best-score";

const STOPWATCH_INTERVAL_MS = 100;

export interface Stopwatch {
  /** Elapsed time for display, refreshed every 100 ms. */
  elapsed: number;
  /** Exact elapsed time right now; use it for recorded results. */
  read: () => number;
}

/** Elapsed time while `running`; freezes when stopped. Remount (via `key`) to reset. */
export function useStopwatch(running: boolean): Stopwatch {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  const baseRef = useRef(0);

  useEffect(() => {
    if (!running) {
      if (startRef.current !== null) baseRef.current += performance.now() - startRef.current;
      startRef.current = null;
      return;
    }
    startRef.current = performance.now();
    const timer = window.setInterval(() => {
      if (startRef.current !== null) setElapsed(baseRef.current + performance.now() - startRef.current);
    }, STOPWATCH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [running]);

  const read = () => Math.round(baseRef.current + (startRef.current === null ? 0 : performance.now() - startRef.current));
  return { elapsed: Math.round(elapsed), read };
}

export interface GameOutcome {
  score: number;
  timeMs: number;
  isRecord: boolean;
}

/** Previous best plus a `record` function that saves a finished game. */
export function useGameRecord(setId: string, game: GameKind) {
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const { data: scores = [] } = useGameScores(setId);
  const { mutate } = useSaveGameScore();
  const best: GameScore | null = bestScore(scores, game);

  const record = (result: { score: number; timeMs: number }): GameOutcome => {
    const outcome = { ...result, timeMs: Math.round(result.timeMs), isRecord: isNewRecord(best, result, game) };
    mutate(
      { setId, game, score: Math.max(0, Math.round(result.score)), timeMs: outcome.timeMs },
      { onError: (error) => toast(errorMessage(error), "error") },
    );
    return outcome;
  };

  return { best, record };
}

export type GamePhase<T> =
  | { name: "intro" }
  | { name: "playing"; round: number }
  | { name: "done"; round: number; outcome: GameOutcome; details: T };

/** Intro → playing → done state machine shared by every game. `round` keys a fresh board. */
export function useGameFlow<T = undefined>() {
  const [phase, setPhase] = useState<GamePhase<T>>({ name: "intro" });
  const start = () => setPhase((current) => ({ name: "playing", round: "round" in current ? current.round + 1 : 1 }));
  const finish = (outcome: GameOutcome, details: T) =>
    setPhase((current) => (current.name === "playing" ? { name: "done", round: current.round, outcome, details } : current));
  return { phase, start, finish };
}
