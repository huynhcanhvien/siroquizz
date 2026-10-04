"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import { SpeakButton } from "@/components/ui/SpeakButton";
import { cn } from "@/lib/cn";
import type { LangCode, Side } from "@/lib/types";
import type {
  Answer,
  MultipleChoiceQuestion,
  Question,
  TrueFalseQuestion,
  WrittenQuestion,
} from "../lib/types";
import { MatchingView } from "./MatchingView";

export interface LangPair {
  termLang: LangCode;
  definitionLang: LangCode;
}

export const langForSide = (side: Side, langs: LangPair) =>
  side === "term" ? langs.termLang : langs.definitionLang;

interface QuestionShellProps {
  number: number;
  question: Question;
  langs: LangPair;
  children: ReactNode;
}

export function QuestionShell({ number, question, langs, children }: QuestionShellProps) {
  const t = useTranslations("test");
  const promptLabel = question.promptSide === "term" ? t("promptTerm") : t("promptDefinition");
  return (
    <section
      id={`question-${question.id}`}
      aria-labelledby={`question-${question.id}-title`}
      className="scroll-mt-24 rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-8"
    >
      <header className="flex items-center justify-between gap-3 text-sm font-semibold text-muted">
        <h2 id={`question-${question.id}-title`}>
          {t("question", { number })} · {t(`type.${question.type}`)}
        </h2>
        <span>{promptLabel}</span>
      </header>
      {question.type !== "matching" ? (
        <div className="mt-4 flex items-start gap-2">
          <p
            lang={langForSide(question.promptSide, langs)}
            className="flex-1 text-2xl font-bold break-words whitespace-pre-line"
          >
            {question.prompt}
          </p>
          <SpeakButton text={question.prompt} lang={langForSide(question.promptSide, langs)} />
        </div>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

const CHOICE_BASE =
  "flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border-2 px-4 py-3 text-left font-medium transition-[border-color,background-color,transform] " +
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ring)] active:scale-[0.99]";

function choiceClasses(selected: boolean) {
  return cn(
    CHOICE_BASE,
    selected
      ? "border-primary bg-primary-soft"
      : "border-border hover:border-border-strong hover:bg-surface-2",
  );
}

interface ViewProps<Q extends Question> {
  question: Q;
  answer: Answer | undefined;
  onAnswer: (answer: Answer) => void;
  langs: LangPair;
}

function MultipleChoiceView({
  question,
  answer,
  onAnswer,
  langs,
}: ViewProps<MultipleChoiceQuestion>) {
  const t = useTranslations("test");
  const name = useId();
  const selected = answer?.type === "multipleChoice" ? answer.optionId : undefined;
  const answerLang = langForSide(question.promptSide === "term" ? "definition" : "term", langs);
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-semibold text-muted">{t("chooseAnswer")}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {question.options.map((option, index) => (
          <label key={option.id} className={choiceClasses(selected === option.id)}>
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={selected === option.id}
              onChange={() => onAnswer({ type: "multipleChoice", optionId: option.id })}
            />
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-3 text-sm font-bold text-muted">
              {index + 1}
            </span>
            <span lang={answerLang} className="break-words">
              {option.text}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function TrueFalseView({ question, answer, onAnswer, langs }: ViewProps<TrueFalseQuestion>) {
  const t = useTranslations("test");
  const name = useId();
  const selected = answer?.type === "trueFalse" ? answer.value : undefined;
  const answerLang = langForSide(question.promptSide === "term" ? "definition" : "term", langs);
  return (
    <div className="flex flex-col gap-5">
      <p
        lang={answerLang}
        className="rounded-lg bg-surface-2 px-4 py-3 text-lg font-semibold break-words"
      >
        {question.candidate}
      </p>
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-muted">{t("isThisCorrect")}</legend>
        <div className="grid grid-cols-2 gap-3">
          {[true, false].map((value) => (
            <label
              key={String(value)}
              className={cn(choiceClasses(selected === value), "justify-center")}
            >
              <input
                type="radio"
                name={name}
                className="sr-only"
                checked={selected === value}
                onChange={() => onAnswer({ type: "trueFalse", value })}
              />
              {value ? (
                <Check className="size-5 text-success" aria-hidden />
              ) : (
                <X className="size-5 text-danger" aria-hidden />
              )}
              {value ? t("true") : t("false")}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function WrittenView({ question, answer, onAnswer, langs }: ViewProps<WrittenQuestion>) {
  const t = useTranslations("test");
  const id = useId();
  const text = answer?.type === "written" ? answer.text : "";
  const answerLang = langForSide(question.promptSide === "term" ? "definition" : "term", langs);
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold text-muted">
        {t("typeAnswer")}
      </label>
      <input
        id={id}
        lang={answerLang}
        value={text}
        onChange={(event) => onAnswer({ type: "written", text: event.target.value })}
        placeholder={t("writtenPlaceholder")}
        autoComplete="off"
        spellCheck={false}
        className="h-13 w-full rounded-lg border-2 border-border bg-surface-2 px-4 text-lg focus:border-primary focus:bg-surface focus:outline-none"
      />
    </div>
  );
}

export function QuestionBody(props: ViewProps<Question>) {
  const { question } = props;
  switch (question.type) {
    case "multipleChoice":
      return <MultipleChoiceView {...props} question={question} />;
    case "trueFalse":
      return <TrueFalseView {...props} question={question} />;
    case "written":
      return <WrittenView {...props} question={question} />;
    case "matching":
      return <MatchingView {...props} question={question} />;
  }
}
