"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/fields";
import { useToast } from "@/components/ui/Toast";
import { useClasses } from "@/features/classes/hooks";
import { CONTENT_LANGUAGES, type LangCode } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-messages";
import { useMaterializeScratch } from "../hooks";
import type { ScratchCard } from "../schemas";

function LanguageSelect(props: {
  label: string;
  value: LangCode;
  onChange: (value: LangCode) => void;
}) {
  const tLang = useTranslations("contentLanguages");
  return (
    <Field label={props.label}>
      {(control) => (
        <Select
          {...control}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value as LangCode)}
        >
          {CONTENT_LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {tLang(code)}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

/** Names the new set, picks its languages and optionally shares it with one of my classes. */
export function MaterializeDialog(props: {
  open: boolean;
  cards: readonly ScratchCard[];
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const t = useTranslations("writing.materialize");
  const router = useRouter();
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const materialize = useMaterializeScratch();
  const classes = useClasses();
  const [title, setTitle] = useState("");
  const [termLang, setTermLang] = useState<LangCode>("en");
  const [definitionLang, setDefinitionLang] = useState<LangCode>("vi");
  const [share, setShare] = useState(false);
  const [classId, setClassId] = useState("");
  const [audience, setAudience] = useState<"class" | "teachers">("class");
  const ready = props.cards.length >= 2 && props.cards.every((card) => card.definition.trim());
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const target = share ? classId || classes.data?.[0]?.id : undefined;
    materialize.mutate(
      {
        ids: props.cards.map((card) => card.id),
        title,
        termLang,
        definitionLang,
        ...(target ? { classId: target, audience } : {}),
      },
      {
        onSuccess: ({ setId }) => {
          toast(t("created"));
          props.onCreated();
          router.push(`/sets/${setId}`);
        },
        onError: (error) => toast(errorMessage(error), "error"),
      },
    );
  };
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange} title={t("title")} size="sm">
      <form onSubmit={submit} className="space-y-3 pb-3">
        <Field label={t("name")}>
          {(control) => (
            <Input
              {...control}
              value={title}
              required
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
            />
          )}
        </Field>
        <LanguageSelect label={t("termLang")} value={termLang} onChange={setTermLang} />
        <LanguageSelect
          label={t("definitionLang")}
          value={definitionLang}
          onChange={setDefinitionLang}
        />
        {classes.data?.length ? (
          <Checkbox
            label={t("share")}
            checked={share}
            onChange={(event) => setShare(event.target.checked)}
          />
        ) : null}
        {share && classes.data?.length ? (
          <>
            <Field label={t("class")}>
              {(control) => (
                <Select
                  {...control}
                  value={classId || classes.data[0].id}
                  onChange={(event) => setClassId(event.target.value)}
                >
                  {classes.data.map((klass) => (
                    <option key={klass.id} value={klass.id}>
                      {klass.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("audience")}>
              {(control) => (
                <Select
                  {...control}
                  value={audience}
                  onChange={(event) => setAudience(event.target.value as "class" | "teachers")}
                >
                  <option value="class">{t("audienceClass")}</option>
                  <option value="teachers">{t("audienceTeachers")}</option>
                </Select>
              )}
            </Field>
          </>
        ) : null}
        {ready ? null : <p className="text-sm text-danger">{t("needTwo")}</p>}
        <div className="flex justify-end">
          <Button type="submit" loading={materialize.isPending} disabled={!ready || !title.trim()}>
            {t("submit", { count: props.cards.length })}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
