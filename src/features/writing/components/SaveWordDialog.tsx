"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/fields";
import { useToast } from "@/components/ui/Toast";
import { useErrorMessage } from "@/lib/use-messages";
import { useCreateScratch } from "../hooks";

/** Saves the selected word (meaning and phonetic optional) to the scratch cards. */
export function SaveWordDialog(props: {
  term: string | null;
  sourceDocId: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("writing.scratch");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const create = useCreateScratch();
  return (
    <Dialog
      open={props.term !== null}
      onOpenChange={(open) => !open && props.onClose()}
      title={t("save")}
      size="sm"
    >
      {props.term !== null ? (
        <SaveWordForm
          key={props.term}
          initialTerm={props.term}
          pending={create.isPending}
          cancelLabel={tCommon("cancel")}
          onCancel={props.onClose}
          onSubmit={(draft) =>
            create.mutate(
              { ...draft, sourceDocId: props.sourceDocId },
              {
                onSuccess: () => toast(t("saved")),
                onError: (error) => toast(errorMessage(error), "error"),
              },
            )
          }
          onDone={props.onClose}
        />
      ) : null}
    </Dialog>
  );
}

function SaveWordForm(props: {
  initialTerm: string;
  pending: boolean;
  cancelLabel: string;
  onCancel: () => void;
  onSubmit: (draft: { term: string; definition: string; phonetic: string | null }) => void;
  onDone: () => void;
}) {
  const t = useTranslations("writing.scratch");
  const [term, setTerm] = useState(props.initialTerm);
  const [definition, setDefinition] = useState("");
  const [phonetic, setPhonetic] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!term.trim()) return;
    props.onSubmit({
      term: term.trim(),
      definition: definition.trim(),
      phonetic: phonetic.trim() || null,
    });
    props.onDone();
  };
  return (
    <form onSubmit={submit} className="space-y-3 pb-3">
      <Field label={t("term")}>
        {(control) => (
          <Input
            {...control}
            value={term}
            maxLength={1000}
            required
            onChange={(event) => setTerm(event.target.value)}
          />
        )}
      </Field>
      <Field label={t("definition")}>
        {(control) => (
          <Input
            {...control}
            value={definition}
            maxLength={1000}
            autoFocus
            onChange={(event) => setDefinition(event.target.value)}
          />
        )}
      </Field>
      <Field label={t("phonetic")}>
        {(control) => (
          <Input
            {...control}
            value={phonetic}
            maxLength={200}
            onChange={(event) => setPhonetic(event.target.value)}
          />
        )}
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={props.onCancel}>
          {props.cancelLabel}
        </Button>
        <Button type="submit" loading={props.pending} disabled={!term.trim()}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
