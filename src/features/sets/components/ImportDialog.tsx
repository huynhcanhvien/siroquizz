"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Label, Textarea } from "@/components/ui/fields";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  parseImportText,
  type CardSeparator,
  type CardSeparatorPreset,
  type ParsedPair,
  type TermSeparator,
  type TermSeparatorPreset,
} from "../lib/import-parser";

const PREVIEW_LIMIT = 50;

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (pairs: ParsedPair[]) => void;
}

function toSeparator<T extends string>(
  choice: T | "custom",
  custom: string,
): T | { custom: string } {
  return choice === "custom" ? { custom } : choice;
}

export function ImportDialog({ open, onOpenChange, onImport }: ImportDialogProps) {
  const t = useTranslations("importDialog");
  const textId = useId();
  const [text, setText] = useState("");
  const [termChoice, setTermChoice] = useState<TermSeparatorPreset | "custom">("tab");
  const [termCustom, setTermCustom] = useState("");
  const [cardChoice, setCardChoice] = useState<CardSeparatorPreset | "custom">("newline");
  const [cardCustom, setCardCustom] = useState("");

  const result = useMemo(
    () =>
      parseImportText(text, {
        termSeparator: toSeparator(termChoice, termCustom) as TermSeparator,
        cardSeparator: toSeparator(cardChoice, cardCustom) as CardSeparator,
      }),
    [cardChoice, cardCustom, termChoice, termCustom, text],
  );

  const handleImport = () => {
    onImport(result.cards);
    setText("");
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description")}
      size="lg"
      footer={
        <Button onClick={handleImport} disabled={result.cards.length === 0}>
          {t("submit", { count: result.cards.length })}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={textId}>{t("textLabel")}</Label>
          <Textarea
            id={textId}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("placeholder")}
            className="min-h-40 font-mono text-sm"
            spellCheck={false}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <SegmentedControl
              label={t("termSeparator")}
              value={termChoice}
              onChange={setTermChoice}
              options={[
                { value: "tab", label: t("tab") },
                { value: "comma", label: t("comma") },
                { value: "dash", label: t("dash") },
                { value: "custom", label: t("custom") },
              ]}
            />
            {termChoice === "custom" ? (
              <Input
                aria-label={t("customLabel")}
                value={termCustom}
                onChange={(event) => setTermCustom(event.target.value)}
                className="h-9"
              />
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <SegmentedControl
              label={t("cardSeparator")}
              value={cardChoice}
              onChange={setCardChoice}
              options={[
                { value: "newline", label: t("newline") },
                { value: "semicolon", label: t("semicolon") },
                { value: "custom", label: t("custom") },
              ]}
            />
            {cardChoice === "custom" ? (
              <Input
                aria-label={t("customLabel")}
                value={cardCustom}
                onChange={(event) => setCardCustom(event.target.value)}
                className="h-9"
              />
            ) : null}
          </div>
        </div>
        <section aria-live="polite" className="rounded-lg border border-border bg-surface-2 p-4">
          <h3 className="flex items-center justify-between text-sm font-bold">
            {t("preview")}
            <span className="font-semibold text-success">
              {t("previewCount", { count: result.cards.length })}
            </span>
          </h3>
          {result.invalidLines.length > 0 ? (
            <p className="mt-2 text-sm font-medium text-danger">
              {t("invalidLines", { lines: result.invalidLines.join(", ") })}
            </p>
          ) : null}
          {result.cards.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{t("empty")}</p>
          ) : (
            <ol className="mt-3 flex max-h-56 flex-col gap-1.5 overflow-y-auto">
              {result.cards.slice(0, PREVIEW_LIMIT).map((pair, index) => (
                <li
                  key={index}
                  className="grid grid-cols-[2rem_1fr_1fr] gap-3 rounded-md bg-surface px-3 py-2 text-sm"
                >
                  <span className="text-subtle">{index + 1}</span>
                  <span className="font-semibold break-words">{pair.term}</span>
                  <span className="break-words text-muted">{pair.definition}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </Dialog>
  );
}
