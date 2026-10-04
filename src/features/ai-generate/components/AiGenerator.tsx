"use client";

import { FlaskConical, WandSparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { GenerationOptions } from "../lib/generator";
import { useAiGeneration } from "../use-ai-generation";
import { GenerationProgress } from "./GenerationProgress";
import { OptionsPanel, PromptPanel } from "./PromptPanel";
import { ReviewGeneratedCards } from "./ReviewGeneratedCards";
import { GenerationHistory } from "./GenerationHistory";
import { UploadDropzone } from "./UploadDropzone";

const DEFAULT_OPTIONS: GenerationOptions = {
  cardCount: 20,
  termLang: "en",
  definitionLang: "vi",
  includePhonetic: true,
};

function AiHeader() {
  const t = useTranslations("ai");
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-3 text-title font-extrabold">
          <span className="grid size-11 place-items-center rounded-xl bg-accent text-on-accent shadow-[0_3px_0_var(--accent-strong)]">
            <WandSparkles className="size-6" aria-hidden />
          </span>
          {t("title")}
        </h1>
        <p className="mt-2 text-lg text-muted">{t("subtitle")}</p>
      </div>
      {process.env.NEXT_PUBLIC_DATA_SOURCE !== "http" ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-bold text-muted">
          <FlaskConical className="size-3.5" aria-hidden />
          {t("mockBadge")}
        </span>
      ) : null}
    </div>
  );
}

export function AiGenerator() {
  const t = useTranslations("ai");
  const [files, setFiles] = useState<File[]>([]);
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState<GenerationOptions>(DEFAULT_OPTIONS);
  const { phase, setPhase, generate, cancel, save, saving } = useAiGeneration();
  const hasInput = files.length > 0 || prompt.trim().length > 0;

  if (phase.name === "generating")
    return <GenerationProgress stage={phase.stage} progress={phase.progress} onCancel={cancel} />;

  if (phase.name === "review") {
    return (
      <ReviewGeneratedCards
        initialTitle={phase.title}
        cards={phase.cards}
        notice={phase.notice}
        onCardsChange={(cards) => setPhase({ ...phase, cards })}
        saving={saving}
        onSave={(title) => save(title, phase.cards, { prompt, options })}
        onStartOver={() => setPhase({ name: "compose" })}
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <AiHeader />
      {process.env.NEXT_PUBLIC_DATA_SOURCE === "http" ? (
        <GenerationHistory
          onOpen={(result, previousPrompt, previousOptions) => {
            setOptions(previousOptions);
            setPrompt(previousPrompt);
            setPhase({
              name: "review",
              cards: result.cards.map((card) => ({ ...card, included: true })),
              title: t("defaultTitle", { source: previousPrompt.slice(0, 40) || t("history") }),
              notice: null,
            });
          }}
        />
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <section
            aria-labelledby="ai-documents"
            className="rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6"
          >
            <h2 id="ai-documents" className="mb-4 text-lg font-bold">
              {t("documentsTitle")}
            </h2>
            <UploadDropzone files={files} onChange={setFiles} />
          </section>
          <PromptPanel value={prompt} onChange={setPrompt} />
        </div>
        <div className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <OptionsPanel options={options} onChange={setOptions} />
          <Button
            size="lg"
            variant="accent"
            disabled={!hasInput}
            onClick={() => generate({ files, prompt, options })}
          >
            <WandSparkles className="size-5" aria-hidden />
            {t("generate")}
          </Button>
          {!hasInput ? <p className="text-center text-sm text-muted">{t("needInput")}</p> : null}
        </div>
      </div>
    </div>
  );
}
