import { describe, expect, it, vi } from "vitest";
import { createRng } from "@/lib/random";
import type { GenerateRequest, GenerationStage } from "./generator";
import { createMockGenerator, sampleCards } from "./mock-generator";
import { SAMPLE_BANK } from "./sample-bank";

const options = {
  cardCount: 5,
  termLang: "zh",
  definitionLang: "vi",
  includePhonetic: true,
} as const;

function request(files: File[], overrides: Partial<GenerateRequest> = {}): GenerateRequest {
  return { files, prompt: "", options, ...overrides };
}

const generator = createMockGenerator({ delayMs: 0, rng: createRng(1) });

describe("sample bank", () => {
  it("has a translation in every language for every entry", () => {
    for (const entry of SAMPLE_BANK) {
      for (const lang of ["vi", "en", "zh", "ja", "ko", "fr", "de"] as const)
        expect(entry[lang]).toBeTruthy();
    }
  });
});

describe("sampleCards", () => {
  it("maps languages and phonetics from the bank", () => {
    const cards = sampleCards(options, createRng(2));
    expect(cards).toHaveLength(5);
    const hello = SAMPLE_BANK.find((entry) => entry.zh === cards[0].term)!;
    expect(cards[0]).toMatchObject({ definition: hello.vi, phonetic: hello.phonetic.zh });
  });

  it("omits phonetics when not requested", () => {
    expect(
      sampleCards({ ...options, includePhonetic: false }, createRng(2))[0].phonetic,
    ).toBeUndefined();
  });
});

describe("mock generator", () => {
  it("parses pairs from text files and reports stages in order", async () => {
    const stages: GenerationStage[] = [];
    const file = new File(["apple - quả táo\npear - quả lê\napple - trùng lặp"], "fruits.txt", {
      type: "text/plain",
    });
    const result = await generator.generate(request([file]), {
      onStage: (stage) => stages.push(stage),
    });
    expect(stages).toEqual(["reading", "analyzing", "generating", "done"]);
    expect(result.cards.map((card) => [card.term, card.definition])).toEqual([
      ["apple", "quả táo"],
      ["pear", "quả lê"],
    ]);
    expect(result.usedSamples).toBe(false);
    expect(result.unreadFiles).toEqual([]);
  });

  it("falls back to sample cards for files it cannot read", async () => {
    const pdf = new File(["%PDF"], "chapter.pdf", { type: "application/pdf" });
    const result = await generator.generate(request([pdf]));
    expect(result.usedSamples).toBe(true);
    expect(result.unreadFiles).toEqual(["chapter.pdf"]);
    expect(result.cards).toHaveLength(options.cardCount);
  });

  it("uses sample cards for a prompt-only request", async () => {
    const result = await generator.generate(request([], { prompt: "20 từ HSK2" }));
    expect(result.usedSamples).toBe(true);
    expect(result.cards.every((card) => card.id)).toBe(true);
  });

  it("respects the requested card count", async () => {
    const lines = Array.from({ length: 10 }, (_, i) => `w${i}\tnghĩa ${i}`).join("\n");
    const result = await generator.generate(
      request([new File([lines], "list.csv", { type: "text/csv" })]),
    );
    expect(result.cards).toHaveLength(5);
  });

  it("rejects with AbortError when cancelled", async () => {
    const slow = createMockGenerator({ delayMs: 50 });
    const controller = new AbortController();
    const promise = slow.generate(request([]), { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const onStage = vi.fn();
    await expect(
      generator.generate(request([]), { signal: controller.signal, onStage }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
