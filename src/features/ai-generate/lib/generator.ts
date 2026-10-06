import type { LangCode } from "@/lib/types";
import type { CreditEstimate } from "../schemas";

export const GENERATION_STAGES = [
  // Scanned PDFs and photos read by OCR on the user's device (only shown when there are any).
  "scanning",
  "uploading",
  "queued",
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
  /** Credits this generation used (1 = 1,000 AI tokens); absent for the offline mock. */
  creditsCharged?: number;
  /** Parts of the document the AI failed on; their cards are missing from the result. */
  skippedParts?: number;
  totalParts?: number;
}

export interface GenerationProgress {
  completed?: number;
  total?: number;
  /** The free AI quota is exhausted for the moment; work resumes automatically. */
  waiting?: boolean;
  /** Jobs from other people that run before this one. */
  queuePosition?: number;
  /** Scanned pages read on the user's device so far. */
  pages?: { completed: number; total: number };
  /** Set once scans were read on the device, so that step stays listed. */
  scanned?: boolean;
}

/** Credits outcome attached (as `cause`) to the error of a failed or cancelled generation. */
export interface CreditOutcome {
  creditsCharged?: number;
  refunded?: boolean;
}

export interface GenerateHandlers {
  signal?: AbortSignal;
  /**
   * Called when the document has been read and generating needs the user's go-ahead. Resolves
   * to the number of cards to create, or null to cancel.
   */
  onConfirm?: (estimate: CreditEstimate) => Promise<number | null>;
  onStage?: (stage: GenerationStage, progress?: GenerationProgress) => void;
  /** Called once the job exists on the server, with its id. */
  onJob?: (jobId: string) => void;
}

/** Phase 1 ships a mock. Phase 3 implements this with the Groq API behind /api/v1/ai. */
export interface CardGenerator {
  generate(request: GenerateRequest, handlers?: GenerateHandlers): Promise<GenerateResult>;
  /**
   * Picks up a job started earlier (another page load) where it stopped. Only generators whose
   * jobs live on a server support it.
   */
  resume?(jobId: string, handlers?: GenerateHandlers): Promise<GenerateResult>;
}
