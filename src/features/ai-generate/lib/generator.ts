import type { LangCode } from "@/lib/types";

export const GENERATION_STAGES = [
  "uploading",
  "reading",
  "analyzing",
  "generating",
  "validating",
  "done",
] as const;
export type GenerationStage = (typeof GENERATION_STAGES)[number];

export const PROMPT_MAX_LENGTH = 1000;
export const CARD_COUNT_MIN = 5;
export const CARD_COUNT_MAX = 200;

export interface GenerationOptions {
  cardCount: number;
  termLang: LangCode;
  definitionLang: LangCode;
  includePhonetic: boolean;
}

export interface GenerateRequest {
  files: readonly File[];
  prompt: string;
  options: GenerationOptions;
}

export interface GeneratedCard {
  id: string;
  term: string;
  definition: string;
  phonetic?: string;
}

export interface GenerateResult {
  cards: GeneratedCard[];
  /** True when nothing could be extracted and placeholder cards were returned. */
  usedSamples: boolean;
  /** Names of files the generator could not read (the mock only reads plain-text formats). */
  unreadFiles: string[];
}

export interface GenerateHandlers {
  signal?: AbortSignal;
  onStage?: (stage: GenerationStage, progress?: { completed?: number; total?: number }) => void;
}

/** Phase 1 ships a mock. Phase 3 implements this with the Groq API behind /api/v1/ai. */
export interface CardGenerator {
  generate(request: GenerateRequest, handlers?: GenerateHandlers): Promise<GenerateResult>;
}
