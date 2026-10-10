"use client";

import { Heart, Pause, Play, Star, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { StudyDirection } from "@/features/study/components/StudyDirection";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useOnceWhen } from "@/lib/client-hooks";
import { cn } from "@/lib/cn";
import type { Card, Side, StudySet } from "@/lib/types";
import { useGameFlow, useGameRecord, useStopwatch } from "../hooks";
import {
  createGravityGame,
  gravityReducer,
  START_LIVES,
  type GravityAction,
  type GravityState,
} from "../lib/gravity";
import { createRng } from "@/lib/random";
import type { GameEvent } from "../lib/replay";
import { RankedSummary, startRankedSession, type RankedSession } from "../ranked";
import { GameIntro, GameResult, StatChip } from "./GameChrome";
import { GAME_META } from "./game-meta";

const DANGER_PROGRESS = 0.75;
/** Caps a single frame's delta so a backgrounded tab does not drop a word instantly on return. */
const MAX_FRAME_MS = 100;

function useAnimationFrame(active: boolean, onFrame: (dtMs: number) => void) {
  const callbackRef = useRef(onFrame);
  useEffect(() => {
    callbackRef.current = onFrame;
  });
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      callbackRef.current(Math.min(MAX_FRAME_MS, now - last));
      last = now;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [active]);
}

function usePauseShortcut(
  status: GravityState["status"],
  dispatch: (action: GravityAction) => void,
) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.repeat)
        dispatch({ type: status === "paused" ? "resume" : "pause" });
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [dispatch, status]);
}

function GravityHud({ state, onTogglePause }: { state: GravityState; onTogglePause: () => void }) {
  const t = useTranslations("games");
  const playing = state.status === "playing";
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <StatChip icon={Star} label={t("score")} value={state.score} />
      <StatChip icon={Zap} value={t("level", { level: state.level })} />
      <StatChip
        tone={state.lives === 1 ? "danger" : "neutral"}
        label={t("lives")}
        value={
          <span role="img" aria-label={`${state.lives}/${START_LIVES}`} className="flex gap-0.5">
            {Array.from({ length: START_LIVES }, (_, index) => (
              <Heart
                key={index}
                aria-hidden
                className={cn(
                  "size-4",
                  index < state.lives ? "fill-danger text-danger" : "text-border-strong",
                )}
              />
            ))}
          </span>
        }
      />
      <Button variant="secondary" size="sm" onClick={onTogglePause}>
        {playing ? (
          <Pause className="size-4" aria-hidden />
        ) : (
          <Play className="size-4" aria-hidden />
        )}
        {playing ? t("pause") : t("resume")}
      </Button>
    </div>
  );
}

function GravityField({
  state,
  set,
  onResume,
}: {
  state: GravityState;
  set: StudySet;
  onResume: () => void;
}) {
  const t = useTranslations("games");
  const word = state.current;
  const promptText = word
    ? state.answerSide === "term"
      ? word.card.definition
      : word.card.term
    : "";
  const promptLang = state.answerSide === "term" ? set.definitionLang : set.termLang;
  const danger = (word?.progress ?? 0) > DANGER_PROGRESS;

  return (
    <div className="[container-type:size] relative h-[min(58vh,30rem)] overflow-hidden rounded-xl border border-border bg-[linear-gradient(to_bottom,var(--surface),color-mix(in_oklch,var(--primary-soft)_70%,var(--surface)))] shadow-inner">
      {word ? (
        <div
          key={word.id}
          className="absolute inset-x-0 top-0 flex justify-center px-4 will-change-transform"
          style={{ transform: `translateY(calc(${word.progress} * (100cqh - 100%)))` }}
        >
          <p
            translate="no"
            lang={promptLang}
            className={cn(
              "max-w-md rounded-lg border-2 bg-surface px-5 py-3 text-center text-lg font-bold [overflow-wrap:anywhere] shadow-md transition-colors",
              danger ? "border-danger text-danger" : "border-primary/40",
            )}
          >
            {promptText}
          </p>
        </div>
      ) : null}
      <div
        aria-hidden
        className={cn(
          "absolute inset-x-0 bottom-0 h-2 transition-colors",
          danger ? "bg-danger" : "bg-primary/30",
        )}
      />
      {state.status === "paused" ? (
        <div className="absolute inset-0 grid place-items-center bg-overlay backdrop-blur-sm">
          <Button size="lg" onClick={onResume}>
            <Play className="size-5" aria-hidden />
            {t("resume")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Announces each outcome and the next prompt for screen-reader users; the falling word is visual only. */
function GravityAnnouncer({ state }: { state: GravityState }) {
  const t = useTranslations("games.gravity");
  const prompt = state.current
    ? state.answerSide === "term"
      ? state.current.card.definition
      : state.current.card.term
    : "";
  const feedback = {
    correct: t("feedbackCorrect", { score: state.score }),
    wrong: t("feedbackWrong"),
    missed: t("feedbackMissed", { lives: state.lives }),
  };
  return (
    <p className="sr-only" aria-live="assertive">
      {state.lastResult ? `${feedback[state.lastResult]} ` : ""}
      {prompt}
    </p>
  );
}

interface GravityBoardProps {
  set: StudySet;
  answerSide: Side;
  session: RankedSession | null;
  onFinish: (state: GravityState, timeMs: number, events: GameEvent[]) => void;
}

function GravityBoard({ set, answerSide, session, onFinish }: GravityBoardProps) {
  const t = useTranslations("games");
  // A ranked game shuffles its deck with the server's seed so the server can replay it.
  const [state, dispatch] = useReducer(gravityReducer, undefined, () =>
    session
      ? createGravityGame(session.cards, answerSide, createRng(session.seed))
      : createGravityGame(set.cards, answerSide),
  );
  const events = useRef<GameEvent[]>([]);
  // Milliseconds since the board appeared; created after mount, read only from event handlers.
  const clock = useRef<() => number>(() => 0);
  const lives = useRef(state.lives);
  useEffect(() => {
    const start = performance.now();
    clock.current = () => Math.round(performance.now() - start);
  }, []);
  // A word reaching the ground costs a life; that is the "missed" event the server checks.
  useEffect(() => {
    if (state.lives < lives.current) events.current.push({ t: clock.current(), missed: true });
    lives.current = state.lives;
  }, [state.lives]);
  const [input, setInput] = useState("");
  const [shaking, setShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const playing = state.status === "playing";
  const { read } = useStopwatch(playing);

  useAnimationFrame(playing, (dtMs) => dispatch({ type: "tick", dtMs }));
  usePauseShortcut(state.status, dispatch);
  useOnceWhen(state.status === "over", () => onFinish(state, read(), events.current));

  useEffect(() => {
    if (playing) inputRef.current?.focus();
  }, [playing]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!input.trim()) return;
    const next = gravityReducer(state, { type: "submit", text: input });
    dispatch({ type: "submit", text: input });
    if (next.lastResult === "correct") {
      events.current.push({ t: clock.current(), text: input });
      setInput("");
    } else setShaking(true);
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <StudyDirection set={set} answerSide={answerSide} />
      <GravityHud
        state={state}
        onTogglePause={() => dispatch({ type: playing ? "pause" : "resume" })}
      />
      <GravityField state={state} set={set} onResume={() => dispatch({ type: "resume" })} />
      <GravityAnnouncer state={state} />
      <form onSubmit={handleSubmit} className="flex gap-3">
        <label htmlFor="gravity-answer" className="sr-only">
          {t("gravity.inputLabel")}
        </label>
        <input
          ref={inputRef}
          id="gravity-answer"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={!playing}
          autoComplete="off"
          spellCheck={false}
          placeholder={t("gravity.inputPlaceholder")}
          onAnimationEnd={() => setShaking(false)}
          className={cn(
            "h-13 min-w-0 flex-1 rounded-lg border-2 border-border bg-surface px-4 text-lg focus:border-primary focus:outline-none",
            shaking && "animate-shake border-danger",
          )}
        />
        <Button type="submit" size="lg" disabled={!playing}>
          {t("gravity.submit")}
        </Button>
      </form>
      <p className="text-center text-sm text-muted">{t("gravity.pauseHint")}</p>
    </div>
  );
}

function MissedList({ cards }: { cards: Card[] }) {
  const t = useTranslations("games.gravity");
  if (cards.length === 0) return <p className="font-semibold text-success">{t("noMissed")}</p>;
  return (
    <section className="w-full text-left">
      <h2 className="mb-2 font-bold">{t("missedTitle")}</h2>
      <ul className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
        {cards.map((card) => (
          <li
            key={card.id}
            className="grid grid-cols-2 gap-3 rounded-md bg-surface-2 px-3 py-2 text-sm"
          >
            <span className="font-semibold">{card.term}</span>
            <span className="text-muted">{card.definition}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GravityGame({ set }: { set: StudySet }) {
  const t = useTranslations("games");
  const tFlash = useTranslations("flashcards");
  const { best, record } = useGameRecord(set.id, "gravity");
  const { phase, start, finish } = useGameFlow<{
    missed: Card[];
    level: number;
    events: GameEvent[];
    sessionId: string | null;
  }>();
  const [answerSide, setAnswerSide] = useState<Side>("term");
  const [session, setSession] = useState<RankedSession | null>(null);
  const [starting, setStarting] = useState(false);
  const begin = async () => {
    if (starting) return;
    setStarting(true);
    setSession(await startRankedSession(set, "gravity", answerSide));
    setStarting(false);
    start();
  };

  if (phase.name === "intro") {
    return (
      <GameIntro
        game="gravity"
        icon={GAME_META.gravity.icon}
        best={best}
        onStart={begin}
        starting={starting}
      >
        <SegmentedControl
          label={t("gravity.answerWith")}
          value={answerSide}
          onChange={setAnswerSide}
          className="w-full"
          options={[
            { value: "term", label: tFlash("frontTerm") },
            { value: "definition", label: tFlash("frontDefinition") },
          ]}
        />
      </GameIntro>
    );
  }

  if (phase.name === "done") {
    return (
      <GameResult
        title={t("gameOver")}
        game="gravity"
        setId={set.id}
        isRecord={phase.outcome.isRecord}
        onPlayAgain={begin}
        stats={[
          { label: t("score"), value: phase.outcome.score },
          { label: t("levelLabel"), value: phase.details.level },
        ]}
      >
        <MissedList cards={phase.details.missed} />
        <RankedSummary
          setId={set.id}
          game="gravity"
          sessionId={phase.details.sessionId}
          events={phase.details.events}
        />
      </GameResult>
    );
  }

  return (
    <GravityBoard
      key={phase.round}
      set={set}
      answerSide={answerSide}
      session={session}
      onFinish={(state, timeMs, events) =>
        finish(record({ score: state.score, timeMs }), {
          missed: state.missed,
          level: state.level,
          events,
          sessionId: session?.id ?? null,
        })
      }
    />
  );
}
