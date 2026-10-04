"use client";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { v7 } from "uuid";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { Select, Label } from "@/components/ui/fields";
import { ProgressBar } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { useReview } from "@/features/srs/hooks";
import { StarButton } from "@/features/srs/components/StarButton";
import { useSaveCardStatus } from "@/features/progress/hooks";
import { generateTest } from "@/features/test/lib/generate-test";
import { gradeQuestion, isAnswered } from "@/features/test/lib/grade";
import { QuestionBody, QuestionShell } from "@/features/test/components/QuestionViews";
import type { Answer, AnswerWith } from "@/features/test/lib/types";
import type { StudySet } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-messages";
import { createLearn, learnReducer } from "../lib/learn-engine";
function LearningSession({
  set,
  written,
  answerWith,
}: {
  set: StudySet;
  written: boolean;
  answerWith: AnswerWith;
}) {
  const t = useTranslations("learning"),
    [state, dispatch] = useReducer(learnReducer, undefined, () =>
      createLearn(
        set.cards.map((c) => c.id),
        written,
      ),
    ),
    [answer, setAnswer] = useState<Answer>(),
    review = useReview(),
    localSave = useSaveCardStatus(set.id),
    { toast } = useToast(),
    errorMessage = useErrorMessage(),
    busy = useRef(false);
  const item = state.round[0],
    card = set.cards.find((c) => c.id === item?.cardId);
  const question = useMemo(
    () =>
      card && item
        ? generateTest(
            [card],
            { questionCount: 1, answerWith, types: [item.level] },
            undefined,
            set.cards,
          )[0]
        : null,
    [card, item, answerWith, set.cards],
  );
  const eventId = useRef("");
  const started = useRef(0);
  useEffect(() => {
    eventId.current = v7();
    started.current = Date.now();
  }, [item]);
  const submit = async () => {
    if (!question || state.phase !== "question" || busy.current) return;
    busy.current = true;
    const correct = gradeQuestion(question, answer).correct,
      durationMs = Math.min(3600000, Date.now() - started.current);
    try {
      if (process.env.NEXT_PUBLIC_DATA_SOURCE === "http")
        await review.mutateAsync({
          eventId: eventId.current,
          cardId: item.cardId,
          rating: !correct ? 1 : item.level === "multipleChoice" || durationMs > 10000 ? 2 : 3,
          mode: "learn",
          durationMs,
        });
      else
        await localSave.mutateAsync({
          cardId: item.cardId,
          status: correct && (item.level === "written" || !written) ? "known" : "learning",
        });
      dispatch({ type: "answer", correct });
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      busy.current = false;
    }
  };
  const advance = () => {
    dispatch({ type: state.phase === "round" ? "nextRound" : "continue" });
    setAnswer(undefined);
    started.current = Date.now();
  };
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <h1 className="text-title font-extrabold">{t("title")}</h1>
      <ProgressBar
        value={state.known.length}
        max={state.total}
        label={t("mastered", { known: state.known.length, total: state.total })}
      />
      <p className="font-semibold">
        {t("round", { round: state.roundNumber })} ·{" "}
        {t("mastered", { known: state.known.length, total: state.total })}
      </p>
      {state.phase === "done" ? (
        <section className="rounded-xl border border-border bg-surface p-6 text-center">
          <h2 className="text-xl font-bold">{t("complete")}</h2>
          <p>{t("accuracy", { correct: state.correct, total: state.correct + state.incorrect })}</p>
        </section>
      ) : state.phase === "round" ? (
        <section className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-xl font-bold">{t("roundComplete")}</h2>
          <Button className="mt-4" onClick={advance}>
            {t("nextRound")}
          </Button>
        </section>
      ) : question && card ? (
        <>
          <div className="flex items-center justify-between">
            <span className="font-bold">{t(item.level)}</span>
            <StarButton setId={set.id} cardId={card.id} />
          </div>
          <QuestionShell
            number={state.correct + state.incorrect + Number(state.phase === "question")}
            question={question}
            langs={{ termLang: set.termLang, definitionLang: set.definitionLang }}
          >
            <QuestionBody
              question={question}
              answer={answer}
              onAnswer={(value) => {
                if (state.phase === "question") setAnswer(value);
              }}
              langs={{ termLang: set.termLang, definitionLang: set.definitionLang }}
            />
          </QuestionShell>
          {state.phase === "feedback" ? (
            <div role="status" className="rounded-lg border border-border bg-surface p-5">
              <p className={state.lastCorrect ? "font-bold text-success" : "font-bold text-danger"}>
                {state.lastCorrect ? t("correct") : t("incorrect")}
              </p>
              <p className="mt-2">{question.promptSide === "term" ? card.definition : card.term}</p>
              <Button className="mt-4" onClick={advance}>
                {t("continue")}
              </Button>
            </div>
          ) : (
            <Button
              disabled={!isAnswered(question, answer)}
              loading={review.isPending || localSave.isPending}
              onClick={() => void submit()}
            >
              {t("check")}
            </Button>
          )}
        </>
      ) : null}
    </div>
  );
}
export function LearnMode({ set }: { set: StudySet }) {
  const t = useTranslations("learning"),
    [started, setStarted] = useState(false),
    [written, setWritten] = useState(true),
    [answerWith, setAnswerWith] = useState<AnswerWith>("definition");
  if (started) return <LearningSession set={set} written={written} answerWith={answerWith} />;
  return (
    <section className="mx-auto max-w-xl rounded-xl border border-border bg-surface p-6">
      <h1 className="text-title font-extrabold">{t("title")}</h1>
      <p className="mt-3 text-muted">{t("description")}</p>
      <div className="mt-5 space-y-4">
        <Switch checked={written} onCheckedChange={setWritten} label={t("includeWritten")} />
        <div>
          <Label htmlFor="learn-side">{t("answerWith")}</Label>
          <Select
            id="learn-side"
            value={answerWith}
            onChange={(e) => setAnswerWith(e.target.value as AnswerWith)}
          >
            <option value="term">{t("answerTerm")}</option>
            <option value="definition">{t("answerDefinition")}</option>
          </Select>
        </div>
        <Button onClick={() => setStarted(true)}>{t("start")}</Button>
      </div>
    </section>
  );
}
