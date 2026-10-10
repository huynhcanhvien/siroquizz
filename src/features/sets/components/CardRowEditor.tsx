"use client";

import { ArrowDown, ArrowUp, Trash } from "lucide-react";
import { useTranslations } from "next-intl";
import type { KeyboardEvent } from "react";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useValidationMessage } from "@/lib/use-messages";
import type { LangCode } from "@/lib/types";
import type { EditorValues } from "../schemas";

interface CardRowEditorProps {
  index: number;
  total: number;
  register: UseFormRegister<EditorValues>;
  errors?: FieldErrors<EditorValues["cards"][number]>;
  showPhonetic: boolean;
  termLang?: LangCode;
  definitionLang?: LangCode;
  isLast: boolean;
  onRemove: () => void;
  onMove: (offset: -1 | 1) => void;
  /** Returns true when it added a new row (and so consumed the Tab key). */
  onTabOut: () => boolean;
}

const FIELD_CLASSES =
  "peer w-full resize-none border-0 border-b-2 border-border-strong bg-transparent px-0 pt-1 pb-1.5 text-[1.05rem] leading-snug " +
  "[field-sizing:content] focus:border-primary focus:outline-none aria-invalid:border-danger";

function UnderlineField({
  label,
  error,
  className,
  ...props
}: React.ComponentProps<"textarea"> & { label: string; error?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-1 flex-col gap-1", className)}>
      <textarea
        translate="no"
        rows={1}
        className={FIELD_CLASSES}
        aria-invalid={Boolean(error)}
        {...props}
      />
      <span className="text-[0.7rem] font-bold tracking-wider text-subtle uppercase peer-focus:text-primary-text">
        {label}
      </span>
      {error ? <span className="text-sm font-medium text-danger">{error}</span> : null}
    </label>
  );
}

export function CardRowEditor({
  index,
  total,
  register,
  errors,
  showPhonetic,
  termLang = "en",
  definitionLang = "vi",
  isLast,
  onRemove,
  onMove,
  onTabOut,
}: CardRowEditorProps) {
  const t = useTranslations("editor");
  const validationMessage = useValidationMessage();
  const number = index + 1;

  const handleLastKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isLast && event.key === "Tab" && !event.shiftKey && onTabOut()) event.preventDefault();
  };

  return (
    <li className="group rounded-xl border border-border bg-surface shadow-sm transition-shadow focus-within:border-primary/50 focus-within:shadow-md">
      <div className="flex items-center gap-1 border-b border-border px-4 py-2">
        <span className="mr-auto text-sm font-bold text-muted">{number}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          aria-label={t("moveUp", { number })}
        >
          <ArrowUp className="size-4" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          aria-label={t("moveDown", { number })}
        >
          <ArrowDown className="size-4" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          disabled={total <= 1}
          aria-label={t("removeCard", { number })}
          className="hover:bg-danger-soft hover:text-danger"
        >
          <Trash className="size-4" aria-hidden />
        </Button>
      </div>
      <div className="flex flex-col gap-5 px-4 pt-4 pb-5 md:flex-row md:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <UnderlineField
            lang={termLang}
            label={t("term")}
            error={validationMessage(errors?.term?.message)}
            {...register(`cards.${index}.term`)}
          />
          {showPhonetic ? (
            <UnderlineField
              label={t("phonetic")}
              placeholder={t("phoneticPlaceholder")}
              error={validationMessage(errors?.phonetic?.message)}
              className="max-w-xs"
              {...register(`cards.${index}.phonetic`)}
            />
          ) : null}
        </div>
        <UnderlineField
          lang={definitionLang}
          label={t("definition")}
          error={validationMessage(errors?.definition?.message)}
          onKeyDown={handleLastKeyDown}
          {...register(`cards.${index}.definition`)}
        />
      </div>
    </li>
  );
}
