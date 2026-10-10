"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { useUpdateSet } from "@/features/sets/hooks";
import { SET_LIMITS } from "@/features/sets/schemas";
import { createHttpClient } from "@/lib/http-client";
import type { StudySet } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-messages";
const client = createHttpClient(),
  schema = z.object({ cards: z.array(z.object({ id: z.string(), text: z.string() })) });
export function AiSetTools({ set }: { set: StudySet }) {
  const t = useTranslations("ai"),
    tEditor = useTranslations("editor"),
    { toast } = useToast(),
    errorMessage = useErrorMessage(),
    update = useUpdateSet(set.id);
  const [busy, setBusy] = useState(false),
    [result, setResult] = useState<{
      kind: "phonetics" | "examples";
      cards: { id: string; text: string; selected: boolean }[];
    } | null>(null);
  const run = async (kind: "phonetics" | "examples", scope: "missing" | "all" = "missing") => {
    setBusy(true);
    try {
      const { data } = await client.request(`/api/v1/ai/${kind}`, schema, {
        method: "POST",
        body: { setId: set.id, ...(kind === "phonetics" ? { scope } : {}) },
      });
      setResult({
        kind,
        cards: data.cards.map((card) => ({
          ...card,
          selected: !set.cards.find((c) => c.id === card.id)?.phonetic?.trim(),
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
        cards: set.cards.map((card) => ({
          ...card,
          phonetic: values.get(card.id) ?? card.phonetic,
        })),
      },
      {
        onSuccess: () => {
          setResult(null);
          toast(t("phoneticsSaved"));
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
        {set.cards.some((card) => card.phonetic?.trim()) &&
        set.cards.some((card) => !card.phonetic?.trim()) ? (
          <Button variant="secondary" disabled={busy} onClick={() => run("phonetics", "all")}>
            {t("reviewPhonetics")}
          </Button>
        ) : null}
        <Button variant="secondary" disabled={busy} onClick={() => run("examples")}>
          {t("createExamples")}
        </Button>
      </div>
      <Dialog
        open={Boolean(result)}
        onOpenChange={(open) => {
          if (!open) setResult(null);
        }}
        title={result?.kind === "phonetics" ? t("fillPhonetics") : t("createExamples")}
        footer={
          result?.kind === "phonetics" ? (
            <Button
              loading={update.isPending}
              disabled={
                !result.cards.some((card) => card.selected) ||
                result.cards.some(
                  (card) =>
                    card.selected &&
                    (!card.text.trim() || card.text.trim().length > SET_LIMITS.phoneticMax),
                )
              }
              onClick={apply}
            >
              {t("applyPhonetics")}
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
                <p translate="no">{card.text}</p>
              )}
            </li>
          ))}
        </ul>
      </Dialog>
    </section>
  );
}
