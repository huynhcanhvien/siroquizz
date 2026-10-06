"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { useSaveTestResult, useUpdateTestResultScore } from "@/features/progress/hooks";
import type { Card, StudySet } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-messages";
import { z } from "zod";
import { createHttpClient } from "@/lib/http-client";
import { generateTest } from "./lib/generate-test";
import { gradeQuestion, gradeTest, questionsForCards } from "./lib/grade";
import type { Answer, AnswerMap, Question, TestConfig } from "./lib/types";

export type TestPhase =
  | { name: "setup" }
  | { name: "taking"; questions: Question[]; startedAt: number }
  | { name: "results"; questions: Question[]; durationMs: number };

/** Owns the setup → taking → results flow, persistence of results and score overrides. */
export function useTestSession(set: StudySet, practice = false) {
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const { mutate: saveResult } = useSaveTestResult();
  const { mutate: updateScore } = useUpdateTestResultScore();
  const [phase, setPhase] = useState<TestPhase>({ name: "setup" });
  const [config, setConfig] = useState<TestConfig>();
  const [answers, setAnswers] = useState<AnswerMap>({});
  const resultIdRef = useRef<string | null>(null);
  const [grading, setGrading] = useState(false);
  const gradingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const onError = (error: unknown) => toast(errorMessage(error), "error");

  const begin = (testConfig: TestConfig, cards: readonly Card[] = set.cards) => {
    const questionCount = Math.min(testConfig.questionCount, cards.length);
    // Distractors always come from the whole set, even when retaking a few cards.
    const questions = generateTest(cards, { ...testConfig, questionCount }, undefined, set.cards);
    resultIdRef.current = null;
    setAnswers({});
    setPhase({ name: "taking", questions, startedAt: Date.now() });
    window.scrollTo({ top: 0 });
  };

  const start = (testConfig: TestConfig) => {
    setConfig(testConfig);
    begin(testConfig);
  };

  const submit = async () => {
    if (phase.name !== "taking" || gradingRef.current) return;
    gradingRef.current = true;
    setGrading(true);
    const abort = new AbortController();
    abortRef.current = abort;
    const next = { ...answers };
    if (config?.semanticGrading && process.env.NEXT_PUBLIC_DATA_SOURCE === "http") {
      const client = createHttpClient();
      try {
        for (const question of phase.questions) {
          if (abort.signal.aborted) return;
          const answer = next[question.id];
          if (
            question.type !== "written" ||
            answer?.type !== "written" ||
            !answer.text.trim() ||
            gradeQuestion(question, answer).correct
          )
            continue;
          const { data } = await client.request(
            "/api/v1/ai/grade",
            z.object({ correct: z.boolean(), reason: z.string() }),
            {
              method: "POST",
              body: {
                expected: question.answer,
                answer: answer.text,
                lang: question.promptSide === "term" ? set.definitionLang : set.termLang,
              },
            },
          );
          if (data.correct) next[question.id] = { ...answer, overridden: true };
        }
      } catch (error) {
        onError(error);
      }
    }
    if (abort.signal.aborted) return;
    setAnswers(next);
    const grade = gradeTest(phase.questions, next);
    const durationMs = Date.now() - phase.startedAt;
    // Practice sessions (a whole folder) have no single set to file the result under.
    if (!practice)
      saveResult(
        { setId: set.id, score: grade.score, total: grade.total, durationMs },
        { onSuccess: (result) => (resultIdRef.current = result.id), onError },
      );
    setPhase({ name: "results", questions: phase.questions, durationMs });
    window.scrollTo({ top: 0 });
    gradingRef.current = false;
    setGrading(false);
  };

  const override = (questionId: string) => {
    const answer = answers[questionId];
    if (phase.name !== "results" || answer?.type !== "written") return;
    const next = { ...answers, [questionId]: { ...answer, overridden: true } };
    setAnswers(next);
    const resultId = resultIdRef.current;
    if (resultId)
      updateScore({ id: resultId, score: gradeTest(phase.questions, next).score }, { onError });
  };

  const retakeMistakes = () => {
    if (phase.name !== "results" || !config) return;
    const mistakeIds = new Set(
      questionsForCards(phase.questions, gradeTest(phase.questions, answers)),
    );
    begin(
      { ...config, questionCount: mistakeIds.size },
      set.cards.filter((card) => mistakeIds.has(card.id)),
    );
  };

  return {
    phase,
    answers,
    config,
    setAnswer: (questionId: string, answer: Answer) =>
      setAnswers((current) => ({ ...current, [questionId]: answer })),
    start,
    submit,
    grading,
    override,
    retake: () => config && begin(config),
    retakeMistakes,
    newTest: () => setPhase({ name: "setup" }),
  };
}
