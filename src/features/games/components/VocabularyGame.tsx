"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/fields";
import { StudyDirection, DirectionSelect } from "@/features/study/components/StudyDirection";
import type { MultipleChoiceQuestion } from "@/features/test/lib/types";
import { isSpellingMatch } from "@/lib/normalize";
import { createRng, shuffle } from "@/lib/random";
import { speak, stopSpeech } from "@/lib/speech";
import { useSpeechVoice } from "@/lib/use-speech-voice";
import type { Card, Side, StudySet } from "@/lib/types";
import { useGameFlow, useGameRecord, useStopwatch } from "../hooks";
import { createQuizQuestions, QUIZ_SECONDS, VOCABULARY_ROUNDS } from "../lib/vocabulary";
import { formatDuration } from "../lib/best-score";
import { GameIntro, GameResult, StatChip } from "./GameChrome";
import { GAME_META } from "./game-meta";

type VocabularyKind = "quiz" | "dictation";
interface Round {
  card: Card;
  question?: MultipleChoiceQuestion;
}

function VocabularyRound({
  round,
  set,
  game,
  answerSide,
  onNext,
}: {
  round: Round;
  set: StudySet;
  game: VocabularyKind;
  answerSide: Side;
  onNext: (correct: boolean) => void;
}) {
  const t = useTranslations("games.practice");
  const common = useTranslations("common");
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<{ correct: boolean }>();
  const [remaining, setRemaining] = useState(QUIZ_SECONDS);
  const [audioError, setAudioError] = useState(false);
  const submitted = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const target = answerSide === "term" ? round.card.term : round.card.definition;
  const targetLang = answerSide === "term" ? set.termLang : set.definitionLang;
  const promptLang = answerSide === "term" ? set.definitionLang : set.termLang;
  const voice = useSpeechVoice(targetLang);
  const check = (correct: boolean) => {
    if (submitted.current) return;
    submitted.current = true;
    stopSpeech();
    setFeedback({ correct });
  };
  useEffect(() => {
    if (game !== "quiz") return;
    // Hidden tabs do not consume the learner's time. Feedback stops the clock.
    const timer = window.setInterval(() => {
      if (document.hidden || submitted.current) return;
      setRemaining((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [game]);
  useEffect(() => {
    if (game === "quiz" && remaining === 0 && !submitted.current) {
      submitted.current = true;
      setFeedback({ correct: false });
    }
  }, [game, remaining]);
  useEffect(() => {
    if (feedback) nextRef.current?.focus();
  }, [feedback]);
  useEffect(() => () => stopSpeech(), []);
  const play = () => {
    setAudioError(!speak(target, targetLang, () => setAudioError(true)));
    inputRef.current?.focus();
  };
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 sm:p-8">
      {game === "quiz" ? (
        <>
          <p className="text-sm font-semibold text-muted">
            {t("timeLeft", { seconds: remaining })}
          </p>
          <p
            translate="no"
            lang={promptLang}
            className="text-2xl font-bold [overflow-wrap:anywhere]"
          >
            {round.question?.prompt}
          </p>
          <fieldset disabled={Boolean(feedback)}>
            <legend className="mb-3 font-semibold">{t("chooseMeaning")}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {round.question?.options.map((option) => (
                <Button
                  key={option.id}
                  variant="secondary"
                  className="h-auto min-h-14 justify-start text-left whitespace-normal"
                  onClick={() => check(option.id === round.question?.correctOptionId)}
                >
                  <span
                    translate="no"
                    lang={targetLang}
                    className="min-w-0 [overflow-wrap:anywhere]"
                  >
                    {option.text}
                  </span>
                </Button>
              ))}
            </div>
          </fieldset>
        </>
      ) : (
        <>
          <p>{t("listenHint")}</p>
          <Button
            variant="secondary"
            onClick={play}
            disabled={voice !== "ready" || Boolean(feedback)}
          >
            <Volume2 className="size-5" aria-hidden />
            {t("replay")}
          </Button>
          {voice !== "ready" || audioError ? (
            <p role="status" className="text-sm text-danger">
              {voice === "loading"
                ? common("loading")
                : audioError
                  ? common("speechFailed")
                  : common("voiceMissing")}
            </p>
          ) : null}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (voice === "ready" && !audioError) check(isSpellingMatch(text, target));
            }}
          >
            <Label htmlFor="dictation-answer">{t("typeHeard")}</Label>
            <Input
              ref={inputRef}
              id="dictation-answer"
              translate="no"
              lang={targetLang}
              value={text}
              onChange={(event) => setText(event.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={Boolean(feedback)}
            />
            <Button
              className="mt-3 w-full"
              type="submit"
              disabled={!text.trim() || Boolean(feedback) || voice !== "ready" || audioError}
            >
              {t("check")}
            </Button>
          </form>
          {!feedback ? (
            <Button variant="ghost" onClick={() => check(false)}>
              {t("skip")}
            </Button>
          ) : null}
        </>
      )}
      {feedback ? (
        <div role="status" className="space-y-3">
          <p className={feedback.correct ? "font-bold text-success" : "font-bold text-danger"}>
            {feedback.correct ? t("correct") : t("incorrect")}
          </p>
          <p className="text-sm font-semibold">{t("expected")}</p>
          <p
            translate="no"
            lang={targetLang}
            className="text-xl font-bold [overflow-wrap:anywhere]"
          >
            {target}
          </p>
          {game === "dictation" ? <p className="text-sm text-muted">{t("spellingHint")}</p> : null}
          <div className="rounded-lg bg-surface-2 p-3 text-sm">
            <p translate="no" lang={set.termLang} className="[overflow-wrap:anywhere]">
              {round.card.term}
            </p>
            <p translate="no" lang={set.definitionLang} className="[overflow-wrap:anywhere]">
              {round.card.definition}
            </p>
          </div>
          <Button ref={nextRef} className="w-full" onClick={() => onNext(feedback.correct)}>
            {t("next")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function VocabularyBoard({
  set,
  pool,
  game,
  answerSide,
  onFinish,
}: {
  set: StudySet;
  pool: readonly Card[];
  game: VocabularyKind;
  answerSide: Side;
  onFinish: (score: number, timeMs: number, wrong: string[]) => void;
}) {
  const t = useTranslations("games.practice");
  const [rounds] = useState<Round[]>(() =>
    game === "quiz"
      ? createQuizQuestions(set.cards, answerSide, undefined, pool).map((question) => ({
          question,
          card: set.cards.find((card) => card.id === question.cardId)!,
        }))
      : shuffle(set.cards)
          .slice(0, VOCABULARY_ROUNDS)
          .map((card) => ({ card })),
  );
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [wrong, setWrong] = useState<string[]>([]);
  const { read } = useStopwatch(true);
  const round = rounds[index];
  if (!round) return <p role="status">{t("noQuestions")}</p>;
  const next = (correct: boolean) => {
    const total = score + (correct ? 10 : 0);
    const misses = correct ? wrong : [...wrong, round.card.id];
    if (index + 1 === rounds.length) onFinish(total, read(), misses);
    else {
      setScore(total);
      setWrong(misses);
      setIndex(index + 1);
    }
  };
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <StudyDirection set={set} answerSide={answerSide} />
      <StatChip value={t("round", { current: index + 1, total: rounds.length })} />
      <VocabularyRound
        key={index}
        round={round}
        set={set}
        game={game}
        answerSide={answerSide}
        onNext={next}
      />
    </div>
  );
}

function VocabularyGame({ set, game }: { set: StudySet; game: VocabularyKind }) {
  const t = useTranslations("games");
  const common = useTranslations("common");
  const [side, setSide] = useState<Side>(game === "dictation" ? "term" : "definition");
  const [practiceSet, setPracticeSet] = useState(set);
  const { best, record } = useGameRecord(set.id, game);
  const { phase, start, finish } = useGameFlow<string[]>();
  const voice = useSpeechVoice(side === "term" ? set.termLang : set.definitionLang);
  const quizPlayable =
    game !== "quiz" || createQuizQuestions(set.cards, side, createRng(0)).length > 0;
  const blocked = game === "dictation" ? voice !== "ready" : !quizPlayable;
  const begin = () => {
    setPracticeSet(set);
    start();
  };
  if (phase.name === "intro")
    return (
      <GameIntro
        game={game}
        icon={GAME_META[game].icon}
        best={best}
        onStart={begin}
        disabled={blocked}
      >
        <DirectionSelect set={set} value={side} onChange={setSide} />
        {blocked ? (
          <p role="status" className="text-sm text-muted">
            {game === "dictation"
              ? voice === "loading"
                ? common("loading")
                : common("voiceMissing")
              : t("practice.noQuestions")}
          </p>
        ) : null}
      </GameIntro>
    );
  if (phase.name === "done")
    return (
      <GameResult
        title={t("finished")}
        game={game}
        setId={set.id}
        isRecord={phase.outcome.isRecord}
        onPlayAgain={begin}
        stats={[
          { label: t("score"), value: phase.outcome.score },
          { label: t("time"), value: formatDuration(phase.outcome.timeMs) },
        ]}
      >
        {phase.details.length > 0 ? (
          <div className="w-full text-left">
            <p className="mb-2 font-bold">{t("practice.reviewMistakes")}</p>
            <ul className="space-y-2">
              {practiceSet.cards
                .filter((card) => phase.details.includes(card.id))
                .map((card) => (
                  <li key={card.id} className="rounded-lg bg-surface-2 p-3">
                    <p translate="no" lang={set.termLang} className="[overflow-wrap:anywhere]">
                      {card.term}
                    </p>
                    <p
                      translate="no"
                      lang={set.definitionLang}
                      className="[overflow-wrap:anywhere]"
                    >
                      {card.definition}
                    </p>
                  </li>
                ))}
            </ul>
            <Button
              variant="secondary"
              className="mt-3 w-full"
              onClick={() => {
                const cards = set.cards.filter((card) => phase.details.includes(card.id));
                setPracticeSet({ ...set, cards });
                start();
              }}
            >
              {t("practice.retryMistakes")}
            </Button>
          </div>
        ) : (
          <p>{t("practice.allCorrect")}</p>
        )}
      </GameResult>
    );
  return (
    <VocabularyBoard
      key={phase.round}
      set={practiceSet}
      pool={set.cards}
      game={game}
      answerSide={side}
      onFinish={(score, timeMs, wrong) => finish(record({ score, timeMs }), wrong)}
    />
  );
}

export function QuizGame({ set }: { set: StudySet }) {
  return <VocabularyGame set={set} game="quiz" />;
}
export function DictationGame({ set }: { set: StudySet }) {
  return <VocabularyGame set={set} game="dictation" />;
}
