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
import type { GenerateRequest, GenerationProgress, GenerationStage } from "./lib/generator";

export type AiPhase =
  | { name: "compose" }
  | {
      name: "generating";
      stage: GenerationStage | null;
      progress?: GenerationProgress;
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
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      abortRef.current?.abort();
    };
  }, []);

  const generate = async (request: GenerateRequest) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ name: "generating", stage: null });
    try {
      const result = await cardGenerator.generate(request, {
        signal: controller.signal,
        onStage: (stage, progress) => setPhase({ name: "generating", stage, progress }),
      });
      const source = request.files[0]
        ? stripExtension(request.files[0].name)
        : request.prompt.trim();
      setPhase({
        name: "review",
        cards: result.cards.map((card) => ({ ...card, included: true })),
        title: t("defaultTitle", { source: source.slice(0, TITLE_SOURCE_MAX) }),
        notice:
          result.unreadFiles.length > 0
            ? t("fallbackNotice", { names: result.unreadFiles.join(", ") })
            : null,
      });
    } catch (error) {
      if (unmountedRef.current) return;
      setPhase({ name: "compose" });
      if (error instanceof DOMException && error.name === "AbortError")
        toast(t("cancelled"), "info");
      else toast(errorMessage(error), "error");
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
    cancel: () => abortRef.current?.abort(),
    save,
    // Stay busy until navigation so a double click cannot save the set twice.
    saving: createSet.isPending || createSet.isSuccess,
  };
}
