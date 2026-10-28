"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input, Textarea } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { useUpdateSet } from "@/features/sets/hooks";
import { SET_LIMITS } from "@/features/sets/schemas";
import { createHttpClient } from "@/lib/http-client";
import type { StudySet } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-messages";
const client = createHttpClient(),
  schema = z.object({
    cards: z.array(z.object({ id: z.string(), text: z.string() })),
    partial: z.boolean().default(false),
    remainingIds: z.array(z.string()).default([]),
  });
type AiKind = "phonetics" | "examples";
// The server answers within its time budget and returns the rest as remainingIds (500 cards ≈ 13
// batches of 40); this bounds the follow-up requests for one click.
const MAX_REQUESTS = 20;

/** Asks the server again with the remaining cards until it has answered for all of them. */
async function fetchSuggestions(kind: AiKind, setId: string, onProgress: (done: number) => void) {
  let found = new Map<string, string>();
  let ids: string[] | undefined;
  for (let attempt = 0; attempt < MAX_REQUESTS; attempt++) {
    const { data } = await client.request(`/api/v1/ai/${kind}`, schema, {
      method: "POST",
      body: { setId, ...(ids ? { ids } : kind === "phonetics" ? { scope: "all" } : {}) },
    });
    found = new Map([
      ...found,
      ...data.cards.map((card): [string, string] => [card.id, card.text]),
    ]);
    onProgress(found.size);
    const remaining = data.remainingIds ?? [];
    // Stop on a complete answer, or when a continuation made no progress.
    if (!data.partial || !remaining.length || (ids && remaining.length >= ids.length)) break;
    ids = remaining;
  }
  return [...found].map(([id, text]) => ({ id, text }));
}
export function AiSetTools({ set }: { set: StudySet }) {
  const t = useTranslations("ai"),
    tEditor = useTranslations("editor"),
    { toast } = useToast(),
    errorMessage = useErrorMessage(),
    update = useUpdateSet(set.id);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [result, setResult] = useState<{
      kind: AiKind;
      cards: { id: string; text: string; selected: boolean }[];
    } | null>(null);
  const run = async (kind: AiKind) => {
    setBusy(true);
    setProgress(0);
    try {
      const cards = await fetchSuggestions(kind, set.id, setProgress);
      setResult({
        kind,
        cards: cards.map((card) => ({
          ...card,
          selected:
            kind === "examples" || !set.cards.find((c) => c.id === card.id)?.phonetic?.trim(),
        })),
      });
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };
  const apply = () => {
    if (!result) return;
    const values = new Map(
      result.cards.filter((c) => c.selected).map((c) => [c.id, c.text.trim()]),
    );
    update.mutate(
      {
        ...set,
        // A collaborator may have saved while the AI ran: the server answers 409 SET_CHANGED.
        baseUpdatedAt: set.updatedAt,
        cards: set.cards.map((card) => ({
          ...card,
          ...(result.kind === "phonetics"
            ? { phonetic: values.get(card.id) ?? card.phonetic }
            : { example: values.get(card.id) ?? card.example }),
        })),
      },
      {
        onSuccess: () => {
          setResult(null);
          toast(t(result.kind === "phonetics" ? "phoneticsSaved" : "examplesSaved"));
        },
        onError: (error) => toast(errorMessage(error), "error"),
      },
    );
  };
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" loading={busy} onClick={() => run("phonetics")}>
          {t("fillPhonetics")}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => run("examples")}>
          {t("createExamples")}
        </Button>
      </div>
      {busy && progress > 0 ? (
        <p role="status" className="mt-3 text-sm text-muted">
          {t("batchProgress", { done: progress, total: set.cards.length })}
        </p>
      ) : null}
      <Dialog
        open={Boolean(result)}
        onOpenChange={(open) => {
          if (!open) setResult(null);
        }}
        title={result?.kind === "phonetics" ? t("fillPhonetics") : t("createExamples")}
        footer={
          result ? (
            <Button
              loading={update.isPending}
              disabled={
                !result.cards.some((card) => card.selected) ||
                result.cards.some(
                  (card) =>
                    card.selected &&
                    (!card.text.trim() ||
                      card.text.trim().length >
                        (result.kind === "phonetics"
                          ? SET_LIMITS.phoneticMax
                          : SET_LIMITS.exampleMax)),
                )
              }
              onClick={apply}
            >
              {t(result.kind === "phonetics" ? "applyPhonetics" : "applyExamples")}
            </Button>
          ) : null
        }
      >
        {result?.kind === "phonetics" ? (
          <p className="mb-4 text-sm text-muted">{t("comparePhonetics")}</p>
        ) : null}
        <ul className="space-y-3">
          {result?.cards.map((card) => (
            <li key={card.id}>
              <strong translate="no" lang={set.termLang}>
                {set.cards.find((c) => c.id === card.id)?.term}
              </strong>
              {result.kind === "phonetics" ? (
                <div className="mt-2 space-y-2">
                  <p className="text-sm">
                    {t("currentPhonetic")}:{" "}
                    <span translate="no">
                      {set.cards.find((c) => c.id === card.id)?.phonetic || t("noPhonetic")}
                    </span>
                  </p>
                  <label className="block text-sm">
                    {t("suggestedPhonetic")}
                    <Input
                      translate="no"
                      aria-label={`${tEditor("phonetic")}: ${set.cards.find((c) => c.id === card.id)?.term}`}
                      value={card.text}
                      maxLength={SET_LIMITS.phoneticMax}
                      disabled={update.isPending}
                      onChange={(event) => {
                        const text = event.target.value;
                        setResult(
                          (current) =>
                            current && {
                              ...current,
                              cards: current.cards.map((entry) =>
                                entry.id === card.id ? { ...entry, text } : entry,
                              ),
                            },
                        );
                      }}
                    />
                  </label>
                  <Checkbox
                    label={t("useSuggestedPhonetic")}
                    checked={card.selected}
                    disabled={update.isPending}
                    onChange={(event) => {
                      const selected = event.target.checked;
                      setResult(
                        (current) =>
                          current && {
                            ...current,
                            cards: current.cards.map((entry) =>
                              entry.id === card.id ? { ...entry, selected } : entry,
                            ),
                          },
                      );
                    }}
                  />
                </div>
              ) : (
                <label className="mt-2 block text-sm">
                  {t("exampleSentence")}
                  <Textarea
                    translate="no"
                    aria-label={`${t("exampleSentence")}: ${set.cards.find((c) => c.id === card.id)?.term}`}
                    value={card.text}
                    maxLength={SET_LIMITS.exampleMax}
                    disabled={update.isPending}
                    onChange={(event) => {
                      const text = event.target.value;
                      setResult(
                        (current) =>
                          current && {
                            ...current,
                            cards: current.cards.map((entry) =>
                              entry.id === card.id ? { ...entry, text } : entry,
                            ),
                          },
                      );
                    }}
                  />
                </label>
              )}
            </li>
          ))}
        </ul>
      </Dialog>
    </section>
  );
}
