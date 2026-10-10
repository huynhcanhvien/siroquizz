"use client";

import { CheckCheck, Link2, ListChecks, PencilLine, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { Input, Label } from "@/components/ui/fields";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { StudyDirection } from "@/features/study/components/StudyDirection";
import type { LangCode } from "@/lib/types";
import { cn } from "@/lib/cn";
import { QUESTION_TYPES, type AnswerWith, type QuestionType, type TestConfig } from "../lib/types";

const TYPE_ICON: Record<QuestionType, LucideIcon> = {
  multipleChoice: ListChecks,
  trueFalse: CheckCheck,
  written: PencilLine,
  matching: Link2,
};

const DEFAULT_COUNT = 10;

interface TestSetupProps {
  setTitle: string;
  termLang?: LangCode;
  definitionLang?: LangCode;
  maxCount: number;
  initialConfig?: TestConfig;
  onStart: (config: TestConfig) => void;
}

export function TestSetup({
  setTitle,
  termLang = "en",
  definitionLang = "vi",
  maxCount,
  initialConfig,
  onStart,
}: TestSetupProps) {
  const t = useTranslations("test");
  const countId = useId();
  const [countText, setCountText] = useState(
    String(initialConfig?.questionCount ?? Math.min(DEFAULT_COUNT, maxCount)),
  );
  const [answerWith, setAnswerWith] = useState<AnswerWith>(
    initialConfig?.answerWith ?? "definition",
  );
  const [types, setTypes] = useState<QuestionType[]>(initialConfig?.types ?? [...QUESTION_TYPES]);
  const [semanticGrading, setSemanticGrading] = useState(initialConfig?.semanticGrading ?? false);
  const tAi = useTranslations("ai");
  const clampedCount = Math.min(Math.max(1, Number.parseInt(countText, 10) || 1), maxCount);

  const toggleType = (type: QuestionType) =>
    setTypes((current) =>
      current.includes(type)
        ? current.filter((item) => item !== type)
        : QUESTION_TYPES.filter((item) => item === type || current.includes(item)),
    );

  return (
    <div className="mx-auto w-full max-w-2xl animate-rise rounded-xl border border-border bg-surface p-6 shadow-lg sm:p-8">
      <p className="text-sm font-semibold text-muted">{setTitle}</p>
      <h1 className="mt-1 text-title font-extrabold">{t("setupTitle")}</h1>

      <div className="mt-8 grid gap-6 sm:grid-cols-[10rem_1fr]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={countId}>{t("questionCount")}</Label>
          <Input
            id={countId}
            type="number"
            inputMode="numeric"
            min={1}
            max={maxCount}
            value={countText}
            onChange={(event) => setCountText(event.target.value)}
            onBlur={() => setCountText(String(clampedCount))}
            aria-describedby={`${countId}-hint`}
            className="text-lg font-bold"
          />
          <p id={`${countId}-hint`} className="text-sm text-muted">
            {t("questionCountHint", { max: maxCount })}
          </p>
        </div>
        <SegmentedControl
          label={t("answerWith")}
          value={answerWith}
          onChange={setAnswerWith}
          options={[
            { value: "term", label: t("answerTerm") },
            { value: "definition", label: t("answerDefinition") },
            { value: "both", label: t("answerBoth") },
          ]}
        />
      </div>

      <StudyDirection
        set={{ termLang, definitionLang }}
        answerSide={answerWith === "term" ? "term" : "definition"}
      />
      {answerWith === "both" ? <p className="mt-2 text-sm text-muted">{t("bothHint")}</p> : null}
      <fieldset className="mt-8">
        <legend className="mb-3 text-sm font-semibold">{t("types")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {QUESTION_TYPES.map((type) => {
            const Icon = TYPE_ICON[type];
            const checked = types.includes(type);
            return (
              <label
                key={type}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border-2 p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--ring)]",
                  checked
                    ? "border-primary bg-primary-soft"
                    : "border-border hover:border-border-strong",
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() => toggleType(type)}
                />
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-md",
                    checked ? "bg-primary text-on-primary" : "bg-surface-3 text-muted",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{t(`type.${type}`)}</span>
                  <span className="block text-sm text-muted">{t(`typeHint.${type}`)}</span>
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "grid size-5 place-items-center rounded-full border-2",
                    checked ? "border-primary bg-primary" : "border-border-strong",
                  )}
                >
                  {checked ? <span className="size-2 rounded-full bg-on-primary" /> : null}
                </span>
              </label>
            );
          })}
        </div>
        {types.length === 0 ? (
          <p role="alert" className="mt-3 text-sm font-medium text-danger">
            {t("typesRequired")}
          </p>
        ) : null}
      </fieldset>

      {process.env.NEXT_PUBLIC_DATA_SOURCE === "http" ? (
        <div className="mt-6">
          <Switch
            checked={semanticGrading}
            onCheckedChange={setSemanticGrading}
            label={tAi("semanticGrading")}
          />
          <p className="mt-2 text-sm text-muted">{tAi("semanticHint")}</p>
        </div>
      ) : null}
      <Button
        size="lg"
        className="mt-8 w-full"
        disabled={types.length === 0}
        onClick={() => onStart({ questionCount: clampedCount, answerWith, types, semanticGrading })}
      >
        {t("start")}
      </Button>
    </div>
  );
}
