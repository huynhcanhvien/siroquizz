"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Label, Select, Textarea } from "@/components/ui/fields";
import { Switch } from "@/components/ui/Switch";
import { cn } from "@/lib/cn";
import { CONTENT_LANGUAGE_OPTIONS, isLangCode } from "@/lib/languages";
import {
  CARD_COUNT_MAX,
  CARD_COUNT_MIN,
  PROMPT_MAX_LENGTH,
  type GenerationOptions,
} from "../lib/generator";

const SUGGESTIONS = ["hsk", "biology", "ielts", "phrasal"] as const;

export function PromptPanel({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("ai");
  const id = useId();
  const nearLimit = value.length > PROMPT_MAX_LENGTH * 0.9;

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6"
    >
      <h2 id={`${id}-title`} className="mb-4 text-lg font-bold">
        <label htmlFor={id}>{t("promptTitle")}</label>
      </h2>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value.slice(0, PROMPT_MAX_LENGTH))}
        maxLength={PROMPT_MAX_LENGTH}
        placeholder={t("promptPlaceholder")}
        aria-describedby={`${id}-counter`}
        className="min-h-32"
      />
      <p
        id={`${id}-counter`}
        className={cn(
          "mt-1.5 text-right text-xs font-semibold tabular-nums",
          nearLimit ? "text-danger" : "text-subtle",
        )}
      >
        {t("promptCounter", { count: value.length, max: PROMPT_MAX_LENGTH })}
      </p>
      <p className="mt-2 mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted">
        <Sparkles className="size-4 text-accent-strong" aria-hidden />
        {t("suggestions")}
      </p>
      <ul className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((key) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => onChange(t(`suggestion.${key}`))}
              className="cursor-pointer rounded-full border border-border bg-surface-2 px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary-text"
            >
              {t(`suggestion.${key}`)}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OptionsPanel({
  options,
  onChange,
}: {
  options: GenerationOptions;
  onChange: (options: GenerationOptions) => void;
}) {
  const t = useTranslations("ai");
  const tEditor = useTranslations("editor");
  const tLang = useTranslations("contentLanguages");
  const countId = useId();

  const languageSelect = (name: "termLang" | "definitionLang") => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${countId}-${name}`}>{tEditor(name)}</Label>
      <Select
        id={`${countId}-${name}`}
        value={options[name]}
        onChange={(event) =>
          isLangCode(event.target.value) && onChange({ ...options, [name]: event.target.value })
        }
      >
        {CONTENT_LANGUAGE_OPTIONS.map((lang) => (
          <option key={lang} value={lang}>
            {tLang(lang)}
          </option>
        ))}
      </Select>
    </div>
  );

  return (
    <section
      aria-labelledby={`${countId}-title`}
      className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6"
    >
      <h2 id={`${countId}-title`} className="text-lg font-bold">
        {t("optionsTitle")}
      </h2>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={countId}>{t("cardCount")}</Label>
          <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-sm font-extrabold text-primary-text tabular-nums">
            {options.cardCount}
          </span>
        </div>
        <input
          id={countId}
          type="range"
          min={CARD_COUNT_MIN}
          max={CARD_COUNT_MAX}
          step={5}
          value={options.cardCount}
          onChange={(event) => onChange({ ...options, cardCount: Number(event.target.value) })}
          className="w-full cursor-pointer accent-[var(--primary)]"
        />
      </div>
      {languageSelect("termLang")}
      {languageSelect("definitionLang")}
      <Switch
        checked={options.includePhonetic}
        onCheckedChange={(includePhonetic) => onChange({ ...options, includePhonetic })}
        label={t("includePhonetic")}
      />
    </section>
  );
}
