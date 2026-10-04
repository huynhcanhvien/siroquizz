"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { useUpdateSet } from "@/features/sets/hooks";
import { createHttpClient } from "@/lib/http-client";
import type { StudySet } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-messages";
const client = createHttpClient(),
  schema = z.object({ cards: z.array(z.object({ id: z.string(), text: z.string() })) });
export function AiSetTools({ set }: { set: StudySet }) {
  const t = useTranslations("ai"),
    { toast } = useToast(),
    errorMessage = useErrorMessage(),
    update = useUpdateSet(set.id);
  const [busy, setBusy] = useState(false),
    [result, setResult] = useState<{
      kind: "phonetics" | "examples";
      cards: { id: string; text: string }[];
    } | null>(null);
  const run = async (kind: "phonetics" | "examples") => {
    setBusy(true);
    try {
      const { data } = await client.request(`/api/v1/ai/${kind}`, schema, {
        method: "POST",
        body: { setId: set.id },
      });
      setResult({ kind, cards: data.cards });
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };
  const apply = () => {
    if (!result) return;
    const values = new Map(result.cards.map((c) => [c.id, c.text]));
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
            <Button loading={update.isPending} onClick={apply}>
              {t("applyPhonetics")}
            </Button>
          ) : null
        }
      >
        <ul className="space-y-3">
          {result?.cards.map((card) => (
            <li key={card.id}>
              <strong>{set.cards.find((c) => c.id === card.id)?.term}</strong>
              <p>{card.text}</p>
            </li>
          ))}
        </ul>
      </Dialog>
    </section>
  );
}
