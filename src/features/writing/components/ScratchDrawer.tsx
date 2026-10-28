"use client";

import { BookmarkPlus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog, Dialog } from "@/components/ui/Dialog";
import { Checkbox, Input } from "@/components/ui/fields";
import { Badge, EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { useErrorMessage } from "@/lib/use-messages";
import { useClearScratch, useDeleteScratch, useScratchCards, useUpdateScratch } from "../hooks";
import type { ScratchCard } from "../schemas";
import { MaterializeDialog } from "./MaterializeDialog";

/** One editable row: changes are saved when a field loses focus. */
function ScratchRow(props: {
  card: ScratchCard;
  selected: boolean;
  onSelect: (selected: boolean) => void;
}) {
  const { card } = props;
  const t = useTranslations("writing.scratch");
  const update = useUpdateScratch();
  const remove = useDeleteScratch();
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const onError = (error: unknown) => toast(errorMessage(error), "error");
  const save = (field: "term" | "definition" | "phonetic", value: string) => {
    const current = card[field] ?? "";
    if (value.trim() === current || (field === "term" && !value.trim())) return;
    update.mutate({ id: card.id, [field]: value.trim() }, { onError });
  };
  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex items-start gap-2">
        <Checkbox
          label={<span className="sr-only">{card.term}</span>}
          checked={props.selected}
          onChange={(event) => props.onSelect(event.target.checked)}
        />
        <div className="grid min-w-0 flex-1 gap-2">
          <Input
            aria-label={t("term")}
            defaultValue={card.term}
            maxLength={1000}
            onBlur={(e) => save("term", e.target.value)}
          />
          <Input
            aria-label={t("definition")}
            placeholder={t("definition")}
            defaultValue={card.definition}
            maxLength={1000}
            onBlur={(e) => save("definition", e.target.value)}
          />
          <Input
            aria-label={t("phonetic")}
            placeholder={t("phonetic")}
            defaultValue={card.phonetic ?? ""}
            maxLength={200}
            onBlur={(e) => save("phonetic", e.target.value)}
          />
          {card.definition.trim() ? null : <Badge tone="danger">{t("missingDefinition")}</Badge>}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("delete")}
          onClick={() => remove.mutate(card.id, { onError })}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
    </li>
  );
}

/** The scratch card list in a side drawer, with "create set" for the selected cards. */
export function ScratchDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("writing.scratch");
  const tCommon = useTranslations("common");
  const cards = useScratchCards();
  const clear = useClearScratch();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const list = cards.data ?? [];
  const chosen = list.filter((card) => selected.has(card.id));
  const toggle = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        side="right"
        title={t("title")}
        description={t("description")}
        footer={
          list.length ? (
            <>
              <Button variant="ghost" onClick={() => setConfirmClear(true)}>
                {t("clear")}
              </Button>
              <Button
                disabled={chosen.length < 2 || chosen.some((card) => !card.definition.trim())}
                onClick={() => setCreating(true)}
              >
                {t("createSet")} ({chosen.length})
              </Button>
            </>
          ) : null
        }
      >
        {list.length ? (
          <>
            <div className="mb-3 flex items-center justify-between">
              <Checkbox
                label={t("selectAll")}
                checked={chosen.length === list.length}
                onChange={(event) =>
                  setSelected(new Set(event.target.checked ? list.map((card) => card.id) : []))
                }
              />
              <span className="text-sm text-muted">{t("selected", { count: chosen.length })}</span>
            </div>
            <ul className="space-y-2 pb-3">
              {list.map((card) => (
                <ScratchRow
                  key={card.id}
                  card={card}
                  selected={selected.has(card.id)}
                  onSelect={(on) => toggle(card.id, on)}
                />
              ))}
            </ul>
          </>
        ) : (
          <EmptyState icon={<BookmarkPlus aria-hidden />} title={t("title")} body={t("empty")} />
        )}
      </Dialog>
      <MaterializeDialog
        open={creating}
        cards={chosen}
        onOpenChange={setCreating}
        onCreated={() => {
          setSelected(new Set());
          setCreating(false);
        }}
      />
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={t("clearTitle")}
        description={t("clearBody")}
        confirmLabel={t("clear")}
        cancelLabel={tCommon("cancel")}
        loading={clear.isPending}
        onConfirm={() => clear.mutate(undefined, { onSuccess: () => setConfirmClear(false) })}
      />
    </>
  );
}
