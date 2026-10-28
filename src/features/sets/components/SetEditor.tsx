"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeftRight, ClipboardPaste, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type KeyboardEvent } from "react";
import { useFieldArray, useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Field, Input, Label, Select, Textarea } from "@/components/ui/fields";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { CONTENT_LANGUAGE_OPTIONS } from "@/lib/languages";
import type { SetSource, StudySet } from "@/lib/types";
import { useValidationMessage } from "@/lib/use-messages";
import type { ParsedPair } from "../lib/import-parser";
import { isBlankCardRow, swapSides } from "../lib/set-utils";
import { dropBlankRows, editorSchema, type EditorValues } from "../schemas";
import { useEditorSubmit, type EditorMode } from "./use-editor-submit";
import { CardRowEditor } from "./CardRowEditor";
import { ImportDialog } from "./ImportDialog";

const EMPTY_ROW = { term: "", definition: "", phonetic: "" };
const INITIAL_ROWS = 3;

function toEditorValues(set?: StudySet): EditorValues {
  if (!set) {
    return {
      title: "",
      description: "",
      termLang: "en",
      definitionLang: "vi",
      cards: Array.from({ length: INITIAL_ROWS }, () => ({ ...EMPTY_ROW })),
    };
  }
  return {
    title: set.title,
    description: set.description,
    termLang: set.termLang,
    definitionLang: set.definitionLang,
    cards: set.cards.map((card) => ({ ...card, phonetic: card.phonetic ?? "" })),
  };
}

function EditorDetails({ form }: { form: UseFormReturn<EditorValues> }) {
  const t = useTranslations("editor");
  const tLang = useTranslations("contentLanguages");
  const validationMessage = useValidationMessage();
  const { register, formState } = form;

  return (
    <div className="grid gap-5">
      <Field label={t("titleLabel")} error={validationMessage(formState.errors.title?.message)}>
        {(control) => (
          <Input
            {...control}
            placeholder={t("titlePlaceholder")}
            className="h-12 text-lg font-semibold"
            {...register("title")}
          />
        )}
      </Field>
      <Field
        label={t("descriptionLabel")}
        error={validationMessage(formState.errors.description?.message)}
      >
        {(control) => (
          <Textarea
            {...control}
            placeholder={t("descriptionPlaceholder")}
            className="min-h-20"
            {...register("description")}
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        {(["termLang", "definitionLang"] as const).map((name) => (
          <Field key={name} label={t(name)}>
            {(control) => (
              <Select {...control} {...register(name)}>
                {CONTENT_LANGUAGE_OPTIONS.map((lang) => (
                  <option key={lang} value={lang}>
                    {tLang(lang)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ))}
      </div>
    </div>
  );
}

/** Propose mode: why the change is suggested, plus the reload prompt after a conflicting save. */
function ProposalNote({ note, onChange }: { note: string; onChange: (note: string) => void }) {
  const t = useTranslations("collab");
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <p className="rounded-md bg-primary-soft px-4 py-3 text-sm">{t("proposeHint")}</p>
      <Label htmlFor={id}>{t("note")}</Label>
      <Textarea
        id={id}
        maxLength={500}
        value={note}
        placeholder={t("notePlaceholder")}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-20"
      />
    </div>
  );
}
function ConflictNotice() {
  const t = useTranslations("collab");
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-danger-soft px-4 py-3 font-medium text-danger"
    >
      {t("conflict")}
      <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
        {t("reload")}
      </Button>
    </div>
  );
}

interface SetEditorProps {
  set?: StudySet;
  openImportOnMount?: boolean;
  /** "propose" sends the changes to the owner for review instead of saving them. */
  mode?: EditorMode;
  /** The class the proposal is made from (propose mode). */
  classId?: string | null;
}

export function SetEditor({
  set,
  openImportOnMount = false,
  mode = "edit",
  classId = null,
}: SetEditorProps) {
  const t = useTranslations("editor");
  const tCollab = useTranslations("collab");
  const tImport = useTranslations("importDialog");
  const { toast } = useToast();
  const validationMessage = useValidationMessage();
  const proposing = mode === "propose" && Boolean(set);
  const [note, setNote] = useState("");

  const [importOpen, setImportOpen] = useState(openImportOnMount);
  const [source, setSource] = useState<SetSource>(set?.source ?? "manual");
  const { submit, busy, conflict } = useEditorSubmit({ set, mode, source, note, classId });
  const [showPhonetic, setShowPhonetic] = useState(
    Boolean(set?.cards.some((card) => card.phonetic)),
  );

  const form = useForm<EditorValues>({
    resolver: zodResolver(editorSchema),
    defaultValues: toEditorValues(set),
  });
  const { control, handleSubmit, getValues, setValue, formState } = form;
  const { fields, append, remove, swap, replace } = useFieldArray({
    control,
    name: "cards",
    keyName: "fieldKey",
  });
  const termLang = useWatch({ control, name: "termLang" });
  const definitionLang = useWatch({ control, name: "definitionLang" });
  const cardsError = formState.errors.cards?.message ?? formState.errors.cards?.root?.message;

  const handleImport = (pairs: ParsedPair[]) => {
    replace([
      ...dropBlankRows(getValues("cards")),
      ...pairs.map((pair) => ({ ...pair, phonetic: "" })),
    ]);
    if (!set) setSource("import");
    toast(tImport("imported", { count: pairs.length }));
  };

  const swapAll = () => {
    const { termLang, definitionLang, cards } = getValues();
    replace(swapSides(cards));
    setValue("termLang", definitionLang);
    setValue("definitionLang", termLang);
  };

  /** Tab on the last field adds a row only when the current row has content, so focus can still leave the list. */
  const handleTabOut = (index: number): boolean => {
    if (isBlankCardRow(getValues(`cards.${index}`))) return false;
    append({ ...EMPTY_ROW }, { focusName: `cards.${index + 1}.term` });
    return true;
  };

  const onSubmit = handleSubmit(submit, () => toast(t("fixErrors"), "error"));

  const submitOnShortcut = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void onSubmit();
    }
  };

  const submitLabel = proposing ? tCollab("send") : set ? t("saveChanges") : t("create");
  const heading = proposing ? tCollab("proposeTitle") : set ? t("editTitle") : t("createTitle");

  return (
    <form
      onSubmit={onSubmit}
      onKeyDown={submitOnShortcut}
      noValidate
      className="flex flex-col gap-8"
    >
      <div className="sticky top-16 z-30 -mx-4 flex items-center justify-between gap-4 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <h1 className="text-xl font-extrabold sm:text-2xl">{heading}</h1>
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
      </div>

      {conflict ? <ConflictNotice /> : null}
      {proposing ? <ProposalNote note={note} onChange={setNote} /> : null}
      <EditorDetails form={form} />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
          <ClipboardPaste className="size-4" aria-hidden />
          {t("import")}
        </Button>
        <Button variant="secondary" size="sm" onClick={swapAll}>
          <ArrowLeftRight className="size-4" aria-hidden />
          {t("swap")}
        </Button>
        <Switch
          className="ml-auto"
          checked={showPhonetic}
          onCheckedChange={setShowPhonetic}
          label={t("showPhonetic")}
        />
      </div>

      {cardsError ? (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 font-medium text-danger">
          {validationMessage(cardsError)}
        </p>
      ) : null}

      <ol className="flex flex-col gap-4">
        {fields.map((field, index) => (
          <CardRowEditor
            key={field.fieldKey}
            index={index}
            total={fields.length}
            register={form.register}
            errors={formState.errors.cards?.[index]}
            termLang={termLang}
            definitionLang={definitionLang}
            showPhonetic={showPhonetic}
            isLast={index === fields.length - 1}
            onRemove={() => remove(index)}
            onMove={(offset) => swap(index, index + offset)}
            onTabOut={() => handleTabOut(index)}
          />
        ))}
      </ol>

      <button
        type="button"
        onClick={() => append({ ...EMPTY_ROW }, { focusName: `cards.${fields.length}.term` })}
        className="flex h-20 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong font-bold text-muted transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary-text"
      >
        <Plus className="size-5" aria-hidden />
        {t("addCard")}
      </button>
      <p className="text-center text-sm text-subtle">{t("tabHint")}</p>

      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={busy}>
          {submitLabel}
        </Button>
      </div>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onImport={handleImport} />
    </form>
  );
}
