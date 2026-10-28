"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { toErrorCode } from "@/lib/repository-error";
import type { SetSource, StudySet } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-messages";
import { useProposeChange } from "../collab/hooks";
import { useCreateSet, useUpdateSet } from "../hooks";
import { diffSet } from "../lib/card-diff";
import { dropBlankRows, type EditorValues } from "../schemas";

export type EditorMode = "edit" | "propose";
interface EditorSubmitOptions {
  set?: StudySet;
  mode: EditorMode;
  source: SetSource;
  note: string;
  classId: string | null;
}

/**
 * Saving from the editor: create a set, save an edit (detecting a concurrent save through
 * `baseUpdatedAt`), or send the difference to the owner as a change request.
 */
export function useEditorSubmit({ set, mode, source, note, classId }: EditorSubmitOptions) {
  const t = useTranslations("editor");
  const tCollab = useTranslations("collab");
  const tValidation = useTranslations("validation");
  const router = useRouter();
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const createSet = useCreateSet();
  const updateSet = useUpdateSet(set?.id ?? "");
  const propose = useProposeChange(set?.id ?? "");
  const [conflict, setConflict] = useState(false);
  const mutation = mode === "propose" ? propose : set ? updateSet : createSet;
  const onError = (error: unknown) => {
    if (toErrorCode(error) === "SET_CHANGED") setConflict(true);
    toast(errorMessage(error), "error");
  };
  const openSet = (id: string) => router.push(`/sets/${id}`);

  const sendProposal = (current: StudySet, values: EditorValues) => {
    const ops = diffSet(current, { ...values, cards: dropBlankRows(values.cards) });
    if (!ops.cards.length && ops.title === undefined && ops.description === undefined) {
      toast(tValidation("noChanges"), "error");
      return;
    }
    propose.mutate(
      { ops, note: note.trim(), baseUpdatedAt: current.updatedAt, classId },
      {
        onSuccess: () => {
          toast(tCollab("sent"));
          openSet(current.id);
        },
        onError,
      },
    );
  };
  const submit = (values: EditorValues) => {
    if (mode === "propose" && set) return sendProposal(set, values);
    const input = { ...values, source, cards: dropBlankRows(values.cards) };
    const onSuccess = (saved: StudySet) => {
      toast(set ? t("saved") : t("created"));
      openSet(saved.id);
    };
    if (set) updateSet.mutate({ ...input, baseUpdatedAt: set.updatedAt }, { onSuccess, onError });
    else createSet.mutate(input, { onSuccess, onError });
  };
  // Stay busy until navigation happens so a double click cannot submit twice.
  return { submit, busy: mutation.isPending || mutation.isSuccess, conflict };
}
