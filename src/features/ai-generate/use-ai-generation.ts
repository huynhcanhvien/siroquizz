"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { useCreateSet } from "@/features/sets/hooks";
import { useRepositories } from "@/lib/data-provider";
import { useErrorMessage } from "@/lib/use-messages";
import type { ReviewCard } from "./components/ReviewGeneratedCards";
import type { CreditEstimate } from "./schemas";
import type {
  CreditOutcome,
  GenerateRequest,
  GenerateResult,
  GenerationProgress,
  GenerationStage,
} from "./lib/generator";

export type AiPhase =
  | { name: "compose" }
  | {
      name: "generating";
      stage: GenerationStage | null;
      progress?: GenerationProgress;
    }
  | {
      name: "confirm";
      estimate: CreditEstimate;
      /** Resolves the pending confirmation: a card count to go ahead, or null to cancel. */
      decide: (cardCount: number | null) => void;
    }
  | { name: "review"; cards: ReviewCard[]; title: string; notice: string | null };

const TITLE_SOURCE_MAX = 40;
const DESCRIPTION_MAX = 500;

const stripExtension = (name: string) => name.replace(/\.[^.]+$/, "");

/** Runs a generation (cancellable, aborted on unmount) and saves the reviewed cards as a set. */
export function useAiGeneration() {
  const queryClient = useQueryClient();
  const t = useTranslations("ai");
  const router = useRouter();
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const { cardGenerator } = useRepositories();
  const createSet = useCreateSet();
  const [phase, setPhase] = useState<AiPhase>({ name: "compose" });
  const abortRef = useRef<AbortController | null>(null);
  const decideRef = useRef<((cardCount: number | null) => void) | null>(null);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      decideRef.current?.(null);
      abortRef.current?.abort();
    };
  }, []);

  /** Pauses on the estimate screen until the user goes ahead (with a card count) or cancels. */
  const confirm = (estimate: CreditEstimate) =>
    new Promise<number | null>((resolve) => {
      const decide = (cardCount: number | null) => {
        decideRef.current = null;
        if (cardCount !== null) setPhase({ name: "generating", stage: "analyzing" });
        resolve(cardCount);
      };
      decideRef.current = decide;
      setPhase({ name: "confirm", estimate, decide });
    });

  /** Tells the user what a failed generation cost: refunded on system errors, else what was used. */
  const creditsNote = (error: unknown) => {
    const outcome = (error instanceof Error ? error.cause : undefined) as CreditOutcome | undefined;
    if (outcome?.refunded) return t("creditsRefunded");
    if (outcome?.creditsCharged) return t("creditsCharged", { credits: outcome.creditsCharged });
    return null;
  };

  const generationNotice = (result: GenerateResult) =>
    [
      result.unreadFiles.length > 0
        ? t("fallbackNotice", { names: result.unreadFiles.join(", ") })
        : null,
      result.skippedParts
        ? t("partialNotice", { skipped: result.skippedParts, total: result.totalParts ?? 0 })
        : null,
      result.creditsCharged === undefined
        ? null
        : result.creditsCharged > 0
          ? t("creditsUsed", { credits: result.creditsCharged })
          : t("creditsFree"),
    ]
      .filter(Boolean)
      .join(" ") || null;

  const generate = async (request: GenerateRequest) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ name: "generating", stage: null });
    try {
      const result = await cardGenerator.generate(request, {
        signal: controller.signal,
        onStage: (stage, progress) => setPhase({ name: "generating", stage, progress }),
        onConfirm: confirm,
      });
      const source = request.files[0]
        ? stripExtension(request.files[0].name)
        : request.prompt.trim();
      setPhase({
        name: "review",
        cards: result.cards.map((card) => ({ ...card, included: true })),
        title: t("defaultTitle", { source: source.slice(0, TITLE_SOURCE_MAX) }),
        notice: generationNotice(result),
      });
    } catch (error) {
      if (unmountedRef.current) return;
      setPhase({ name: "compose" });
      if (error instanceof DOMException && error.name === "AbortError")
        toast(t("cancelled"), "info");
      else toast([errorMessage(error), creditsNote(error)].filter(Boolean).join(" "), "error");
    } finally {
      void queryClient.invalidateQueries({ queryKey: ["ai-quota"] });
      void queryClient.invalidateQueries({ queryKey: ["ai-jobs"] });
    }
  };

  const save = (
    title: string,
    cards: ReviewCard[],
    request: Pick<GenerateRequest, "prompt" | "options">,
  ) =>
    createSet.mutate(
      {
        title,
        description: request.prompt.trim().slice(0, DESCRIPTION_MAX),
        termLang: request.options.termLang,
        definitionLang: request.options.definitionLang,
        source: "ai",
        cards: cards.filter((card) => card.included && card.term.trim() && card.definition.trim()),
      },
      {
        onSuccess: (set) => {
          toast(t("saved"));
          router.push(`/sets/${set.id}`);
        },
        onError: (error) => toast(errorMessage(error), "error"),
      },
    );

  return {
    phase,
    setPhase,
    generate,
    generationNotice,
    cancel: () => abortRef.current?.abort(),
    save,
    // Stay busy until navigation so a double click cannot save the set twice.
    saving: createSet.isPending || createSet.isSuccess,
  };
}
