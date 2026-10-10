"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useToast } from "@/components/ui/Toast";
import { useCreateSet } from "@/features/sets/hooks";
import { useRepositories } from "@/lib/data-provider";
import { useErrorMessage } from "@/lib/use-messages";
import { AiJobIndicator } from "./components/AiJobIndicator";
import type { ReviewCard } from "./components/ReviewGeneratedCards";
import { AI_PAGE, aiJobsQuery, OPEN_JOB_STATUSES } from "./lib/jobs-query";
import type { CreditEstimate } from "./schemas";
import type {
  CreditOutcome,
  GenerateHandlers,
  GenerateRequest,
  GenerateResult,
  GenerationOptions,
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
  | {
      name: "review";
      cards: ReviewCard[];
      title: string;
      notice: string | null;
      options: GenerationOptions;
    };

/** What the saved set takes from the request: its description and languages. */
type SetSource = Pick<GenerateRequest, "prompt" | "options">;

interface AiGenerationApi {
  phase: AiPhase;
  setPhase: (phase: AiPhase) => void;
  generate: (request: GenerateRequest) => Promise<void>;
  /** Picks up the newest unfinished job from an earlier page load, once per load. */
  resumeOpenJob: () => Promise<void>;
  /** Shows a finished generation (from the history) for review. */
  openResult: (result: GenerateResult, prompt: string, options: GenerationOptions) => void;
  generationNotice: (result: GenerateResult) => string | null;
  cancel: () => void;
  save: (title: string, cards: ReviewCard[]) => void;
  saving: boolean;
}

const TITLE_SOURCE_MAX = 40;
const DESCRIPTION_MAX = 500;

const stripExtension = (name: string) => name.replace(/\.[^.]+$/, "");

const AiGenerationContext = createContext<AiGenerationApi | null>(null);

/**
 * Owns the AI generation for the whole app, above every page: leaving the generator page keeps
 * the job running (with a small indicator elsewhere) instead of cancelling it. Only Cancel stops
 * a job. A closed tab leaves the job paused on the server; the next page load picks it up.
 */
export function AiGenerationProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const t = useTranslations("ai");
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const { cardGenerator } = useRepositories();
  const createSet = useCreateSet();
  const [phase, setPhase] = useState<AiPhase>({ name: "compose" });
  const [source, setSource] = useState<SetSource | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);
  const resumeCheckedRef = useRef(false);
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);
  const awayFromGenerator = () => pathnameRef.current !== AI_PAGE;

  /** Pauses on the estimate screen until the user goes ahead (with a card count) or cancels. */
  const confirm = (estimate: CreditEstimate) =>
    new Promise<number | null>((resolve) => {
      const decide = (cardCount: number | null) => {
        if (cardCount !== null) setPhase({ name: "generating", stage: "analyzing" });
        resolve(cardCount);
      };
      setPhase({ name: "confirm", estimate, decide });
      if (awayFromGenerator()) toast(t("background.confirmToast"), "info");
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

  const reviewPhase = (
    result: GenerateResult,
    title: string,
    options: GenerationOptions,
  ): AiPhase => ({
    name: "review",
    options,
    cards: result.cards.map((card) => ({ ...card, included: true })),
    title,
    notice: generationNotice(result),
  });
  const titleFrom = (text: string) =>
    t("defaultTitle", { source: text.trim().slice(0, TITLE_SOURCE_MAX) || t("history") });

  /** Runs one generation to its end; only one runs at a time. */
  const run = async (
    work: (handlers: GenerateHandlers) => Promise<GenerateResult>,
    title: string,
    setSourceTo: SetSource,
  ) => {
    if (runningRef.current) return;
    runningRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setSource(setSourceTo);
    setPhase({ name: "generating", stage: null });
    try {
      const result = await work({
        signal: controller.signal,
        onStage: (stage, progress) => setPhase({ name: "generating", stage, progress }),
        onConfirm: confirm,
      });
      setPhase(reviewPhase(result, title, setSourceTo.options));
      if (awayFromGenerator()) toast(t("background.readyToast"));
    } catch (error) {
      setPhase({ name: "compose" });
      if (error instanceof DOMException && error.name === "AbortError")
        toast(t("cancelled"), "info");
      else toast([errorMessage(error), creditsNote(error)].filter(Boolean).join(" "), "error");
    } finally {
      runningRef.current = false;
      abortRef.current = null;
      void queryClient.invalidateQueries({ queryKey: ["ai-quota"] });
      void queryClient.invalidateQueries({ queryKey: aiJobsQuery.queryKey });
    }
  };

  const generate = (request: GenerateRequest) =>
    run(
      (handlers) => cardGenerator.generate(request, handlers),
      titleFrom(request.files[0] ? stripExtension(request.files[0].name) : request.prompt),
      request,
    );

  const resumeOpenJob = async () => {
    const resume = cardGenerator.resume;
    if (!resume || resumeCheckedRef.current || runningRef.current) return;
    resumeCheckedRef.current = true;
    let jobs;
    try {
      jobs = await queryClient.fetchQuery(aiJobsQuery);
    } catch {
      // Nothing to pick up is the safe reading; the history shows the jobs once it loads.
      return;
    }
    const open = jobs.find((job) => OPEN_JOB_STATUSES.has(job.status));
    if (!open || runningRef.current) return;
    toast(t("background.resumed"), "info");
    await run((handlers) => resume(open.id, handlers), titleFrom(open.prompt), {
      prompt: open.prompt,
      options: open.options,
    });
  };

  const openResult = (result: GenerateResult, prompt: string, options: GenerationOptions) => {
    setSource({ prompt, options });
    setPhase(reviewPhase(result, titleFrom(prompt), options));
  };

  const save = (title: string, cards: ReviewCard[]) => {
    if (!source) return;
    createSet.mutate(
      {
        title,
        description: source.prompt.trim().slice(0, DESCRIPTION_MAX),
        termLang: source.options.termLang,
        definitionLang: source.options.definitionLang,
        source: "ai",
        cards: cards.filter((card) => card.included && card.term.trim() && card.definition.trim()),
      },
      {
        onSuccess: (set) => {
          toast(t("saved"));
          setPhase({ name: "compose" });
          router.push(`/sets/${set.id}`);
        },
        onError: (error) => toast(errorMessage(error), "error"),
      },
    );
  };

  const api: AiGenerationApi = {
    phase,
    setPhase,
    generate,
    resumeOpenJob,
    openResult,
    generationNotice,
    cancel: () => abortRef.current?.abort(),
    save,
    saving: createSet.isPending,
  };

  return (
    <AiGenerationContext.Provider value={api}>
      {children}
      {pathname === AI_PAGE ? null : <AiJobIndicator phase={phase} />}
    </AiGenerationContext.Provider>
  );
}

export function useAiGeneration(): AiGenerationApi {
  const api = useContext(AiGenerationContext);
  if (!api) throw new Error("useAiGeneration must be used inside <AiGenerationProvider>");
  return api;
}
