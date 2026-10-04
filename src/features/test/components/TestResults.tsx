"use client";

import { Check, RotateCcw, Settings2, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { Answer, AnswerMap, Question, QuestionResult, TestGrade } from "../lib/types";

const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function ScoreRing({ ratio }: { ratio: number }) {
  const percent = Math.round(ratio * 100);
  const tone =
    ratio >= 0.8 ? "var(--success)" : ratio >= 0.5 ? "var(--accent-strong)" : "var(--danger)";
  return (
    <div className="relative size-36 shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
        <circle
          cx="60"
          cy="60"
          r={RING_RADIUS}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth="12"
        />
        <circle
          cx="60"
          cy="60"
          r={RING_RADIUS}
          fill="none"
          stroke={tone}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - ratio)}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-3xl font-extrabold tabular-nums">
        {percent}%
      </span>
    </div>
  );
}

interface AnswerLines {
  given: string;
  expected: string;
}

function describeAnswer(
  question: Question,
  answer: Answer | undefined,
  t: (key: "true" | "false" | "noAnswer") => string,
): AnswerLines[] {
  switch (question.type) {
    case "multipleChoice": {
      const given =
        answer?.type === "multipleChoice"
          ? question.options.find((o) => o.id === answer.optionId)?.text
          : undefined;
      const expected = question.options.find((o) => o.id === question.correctOptionId)?.text ?? "";
      return [{ given: given ?? t("noAnswer"), expected }];
    }
    case "trueFalse": {
      const given =
        answer?.type === "trueFalse" ? t(answer.value ? "true" : "false") : t("noAnswer");
      return [{ given: `${question.candidate} → ${given}`, expected: question.correctAnswer }];
    }
    case "written":
      return [
        {
          given: answer?.type === "written" && answer.text.trim() ? answer.text : t("noAnswer"),
          expected: question.answer,
        },
      ];
    case "matching": {
      const matches = answer?.type === "matching" ? answer.matches : {};
      return question.pairs
        .filter((pair) => matches[pair.cardId] !== pair.cardId)
        .map((pair) => {
          const chosen = question.pairs.find(
            (item) => item.cardId === matches[pair.cardId],
          )?.answer;
          return {
            given: `${pair.prompt} → ${chosen ?? t("noAnswer")}`,
            expected: `${pair.prompt} → ${pair.answer}`,
          };
        });
    }
  }
}

interface TestResultsProps {
  questions: Question[];
  answers: AnswerMap;
  grade: TestGrade;
  durationMs: number;
  onOverride: (questionId: string) => void;
  onRetake: () => void;
  onRetakeMistakes: () => void;
  onNewTest: () => void;
}

function MistakeItem({
  question,
  result,
  answer,
  onOverride,
}: {
  question: Question;
  result: QuestionResult;
  answer: Answer | undefined;
  onOverride: () => void;
}) {
  const t = useTranslations("test");
  const lines = describeAnswer(question, answer, (key) => t(key));
  return (
    <li className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <p className="text-sm font-semibold text-muted">{t(`type.${question.type}`)}</p>
      {question.type !== "matching" ? (
        <p className="mt-1 text-lg font-bold break-words">{question.prompt}</p>
      ) : null}
      <dl className="mt-3 flex flex-col gap-2">
        {lines.map((line, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-md bg-danger-soft px-3 py-2">
              <dt className="flex items-center gap-1 text-xs font-bold text-danger">
                <X className="size-3.5" aria-hidden />
                {t("yourAnswer")}
              </dt>
              <dd className="break-words">{line.given}</dd>
            </div>
            <div className="rounded-md bg-success-soft px-3 py-2">
              <dt className="flex items-center gap-1 text-xs font-bold text-success">
                <Check className="size-3.5" aria-hidden />
                {t("correctAnswer")}
              </dt>
              <dd className="break-words">{line.expected}</dd>
            </div>
          </div>
        ))}
      </dl>
      {question.type === "written" && !result.correct ? (
        <Button variant="ghost" size="sm" className="mt-3" onClick={onOverride}>
          <Check className="size-4" aria-hidden />
          {t("overrideCorrect")}
        </Button>
      ) : null}
    </li>
  );
}

export function TestResults({
  questions,
  answers,
  grade,
  durationMs,
  onOverride,
  onRetake,
  onRetakeMistakes,
  onNewTest,
}: TestResultsProps) {
  const t = useTranslations("test");
  const format = useFormatter();
  const ratio = grade.total > 0 ? grade.score / grade.total : 0;
  const verdict = ratio >= 0.8 ? t("great") : ratio >= 0.5 ? t("good") : t("keepGoing");
  const mistakes = questions.flatMap((question, index) =>
    grade.results[index].correct ? [] : [{ question, result: grade.results[index] }],
  );
  const seconds = Math.round(durationMs / 1000);
  const time =
    format.number(Math.floor(seconds / 60)) + ":" + String(seconds % 60).padStart(2, "0");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <section className="flex animate-pop flex-col items-center gap-6 rounded-xl border border-border bg-surface p-6 text-center shadow-lg sm:flex-row sm:p-8 sm:text-left">
        <ScoreRing ratio={ratio} />
        <div className="flex-1">
          <h1 data-phase-heading tabIndex={-1} className="text-title font-extrabold outline-none">
            {verdict}
          </h1>
          <p className="mt-1 text-lg font-semibold">
            {t("scoreLabel", { score: grade.score, total: grade.total })}
          </p>
          <p className="mt-1 text-muted">{t("time", { time })}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2 sm:justify-start">
            {mistakes.length > 0 ? (
              <Button onClick={onRetakeMistakes}>
                <RotateCcw className="size-4" aria-hidden />
                {t("retakeMistakes")}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={onRetake}>
              {t("retake")}
            </Button>
            <Button variant="ghost" onClick={onNewTest}>
              <Settings2 className="size-4" aria-hidden />
              {t("newTest")}
            </Button>
          </div>
        </div>
      </section>

      <section aria-labelledby="mistakes-title">
        <h2 id="mistakes-title" className="mb-4 text-xl font-bold">
          {t("mistakesTitle")}
        </h2>
        {mistakes.length === 0 ? (
          <p className="rounded-xl bg-success-soft px-5 py-4 font-semibold text-success">
            {t("noMistakes")}
          </p>
        ) : (
          <ul className={cn("flex flex-col gap-3")}>
            {mistakes.map(({ question, result }) => (
              <MistakeItem
                key={question.id}
                question={question}
                result={result}
                answer={answers[question.id]}
                onOverride={() => {
                  onOverride(question.id);
                  // The item disappears once it counts as correct; keep keyboard focus on the results.
                  requestAnimationFrame(() =>
                    document.querySelector<HTMLElement>("[data-phase-heading]")?.focus(),
                  );
                }}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
