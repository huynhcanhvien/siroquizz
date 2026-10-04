import { parseAutoDetected } from "@/features/sets/lib/import-parser";
import { createId } from "@/lib/id";
import { normalizeAnswer } from "@/lib/normalize";
import { defaultRng, shuffle, type Rng } from "@/lib/random";
import { isTextFile } from "./file-validation";
import type { CardGenerator, GeneratedCard, GenerateResult, GenerationOptions } from "./generator";
import { SAMPLE_BANK } from "./sample-bank";

const DEFAULT_STAGE_DELAY_MS = 700;

function abortError(): DOMException {
  return new DOMException("Generation cancelled", "AbortError");
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function sampleCards(options: GenerationOptions, rng: Rng = defaultRng): GeneratedCard[] {
  return shuffle(SAMPLE_BANK, rng)
    .slice(0, options.cardCount)
    .map((entry) => {
      const phonetic = options.includePhonetic ? entry.phonetic[options.termLang] : undefined;
      return {
        id: createId(),
        term: entry[options.termLang],
        definition: entry[options.definitionLang],
        ...(phonetic ? { phonetic } : {}),
      };
    });
}

function uniqueByTerm<T extends { term: string }>(pairs: readonly T[]): T[] {
  const seen = new Set<string>();
  return pairs.filter((pair) => {
    const key = normalizeAnswer(pair.term);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface MockOptions {
  delayMs?: number;
  rng?: Rng;
}

/**
 * Phase 1 stand-in for the AI backend: reads plain-text files for real and
 * returns sample cards for formats that need a model (PDF, DOCX, images).
 */
export function createMockGenerator({
  delayMs = DEFAULT_STAGE_DELAY_MS,
  rng = defaultRng,
}: MockOptions = {}): CardGenerator {
  return {
    async generate(request, { signal, onStage } = {}): Promise<GenerateResult> {
      if (signal?.aborted) throw abortError();
      onStage?.("reading");
      const textFiles = request.files.filter(isTextFile);
      const texts = await Promise.all(textFiles.map((file) => file.text()));
      await wait(delayMs, signal);

      onStage?.("analyzing");
      const parsedPerFile = texts.map((text) => parseAutoDetected(text).cards);
      await wait(delayMs, signal);

      onStage?.("generating");
      const parsed = uniqueByTerm(parsedPerFile.flat());
      await wait(delayMs, signal);

      const usedSamples = parsed.length === 0;
      const cards = usedSamples
        ? sampleCards(request.options, rng)
        : parsed.slice(0, request.options.cardCount).map((pair) => ({ id: createId(), ...pair }));
      const readNames = new Set(
        textFiles.filter((_, index) => parsedPerFile[index].length > 0).map((file) => file.name),
      );
      onStage?.("done");
      return {
        cards,
        usedSamples,
        unreadFiles: request.files.map((file) => file.name).filter((name) => !readNames.has(name)),
      };
    },
  };
}
