"use client";

import { ListChecks } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { EmptyState, ProgressBar } from "@/components/ui/misc";
import type { StudySet } from "@/lib/types";
import { maxQuestionCount } from "../lib/generate-test";
import { countAnswered, gradeTest } from "../lib/grade";
import type { Answer, AnswerMap, Question } from "../lib/types";
import { useTestSession } from "../use-test-session";
import { QuestionBody, QuestionShell, type LangPair } from "./QuestionViews";
import { TestResults } from "./TestResults";
import { TestSetup } from "./TestSetup";

const MIN_CARDS = 2;

interface TestTakingProps {
  questions: Question[];
  answers: AnswerMap;
  langs: LangPair;
  onAnswer: (questionId: string, answer: Answer) => void;
  onSubmit: () => void;
  grading: boolean;
}

function TestTaking({ questions, answers, langs, onAnswer, onSubmit, grading }: TestTakingProps) {
  const t = useTranslations("test");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const answered = countAnswered(questions, answers);
  const progressLabel = t("answered", { answered, total: questions.length });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <h1 data-phase-heading tabIndex={-1} className="sr-only">
        {t("takingTitle")}
      </h1>
      <div className="sticky top-16 z-30 -mx-4 flex items-center gap-4 bg-bg/90 px-4 py-3 backdrop-blur-md sm:mx-0 sm:rounded-b-lg">
        <ProgressBar
          value={answered}
          max={questions.length}
          label={progressLabel}
          className="flex-1"
        />
        <span className="text-sm font-bold text-muted tabular-nums">{progressLabel}</span>
      </div>
      {questions.map((question, index) => (
        <QuestionShell key={question.id} number={index + 1} question={question} langs={langs}>
          <QuestionBody
            question={question}
            answer={answers[question.id]}
            onAnswer={(answer) => onAnswer(question.id, answer)}
            langs={langs}
          />
        </QuestionShell>
      ))}
      <Button
        loading={grading}
        size="lg"
        className="mt-4 self-center px-12"
        onClick={() => (answered < questions.length ? setConfirmOpen(true) : onSubmit())}
      >
        {t("submit")}
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("confirmTitle")}
        description={t("confirmBody", { count: questions.length - answered })}
        confirmLabel={t("confirmSubmit")}
        cancelLabel={t("keepWorking")}
        onConfirm={() => {
          setConfirmOpen(false);
          onSubmit();
        }}
        tone="primary"
      />
    </div>
  );
}

export function TestMode({ set }: { set: StudySet }) {
  const t = useTranslations("test");
  const session = useTestSession(set);
  const { phase } = session;

  // Move focus to the new screen's heading so keyboard and screen-reader users aren't stranded.
  useEffect(() => {
    if (phase.name !== "setup")
      document.querySelector<HTMLElement>("[data-phase-heading]")?.focus();
  }, [phase.name]);

  if (set.cards.length < MIN_CARDS) {
    return (
      <EmptyState
        icon={<ListChecks aria-hidden />}
        title={t("notEnoughCards")}
        className="mx-auto max-w-xl"
      />
    );
  }

  if (phase.name === "setup") {
    return (
      <TestSetup
        setTitle={set.title}
        maxCount={maxQuestionCount(set.cards)}
        initialConfig={session.config}
        onStart={session.start}
      />
    );
  }

  if (phase.name === "results") {
    return (
      <TestResults
        questions={phase.questions}
        answers={session.answers}
        grade={gradeTest(phase.questions, session.answers)}
        durationMs={phase.durationMs}
        onOverride={session.override}
        onRetake={session.retake}
        onRetakeMistakes={session.retakeMistakes}
        onNewTest={session.newTest}
      />
    );
  }

  return (
    <TestTaking
      questions={phase.questions}
      answers={session.answers}
      langs={{ termLang: set.termLang, definitionLang: set.definitionLang }}
      onAnswer={session.setAnswer}
      onSubmit={session.submit}
      grading={session.grading}
    />
  );
}
