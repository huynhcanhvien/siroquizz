import { beforeEach, expect, it, vi } from "vitest";
import type { AiJobState } from "@/features/ai-generate/schemas";
import { ApiError } from "@/server/api-error";
import { advanceGeneration, planTasks } from "@/server/ai/generate";
import { estimateTokens } from "@/features/ai-generate/lib/output";

const provider = vi.hoisted(() => vi.fn());
vi.mock("@/server/ai/groq", async () => {
  const { ApiError } = await import("@/server/api-error");
  class RateLimitError extends ApiError {
    constructor(public readonly retryAfterMs: number) {
      super(429, "RATE_LIMITED");
    }
  }
  return { groqJson: provider, RateLimitError };
});
vi.mock("@/server/env", () => ({
  getServerEnv: () => ({
    GROQ_TEXT_MODEL: "openai/gpt-oss-120b",
    GROQ_FALLBACK_MODEL: "openai/gpt-oss-20b",
  }),
}));
const { RateLimitError } = await import("@/server/ai/groq");

const options = {
  cardCount: 4,
  termLang: "en",
  definitionLang: "vi",
  includePhonetic: false,
} as const;
const usage = { input: 10, output: 20, cached: 0, cost: 0.001 };
const cards = (...terms: string[]) => ({
  data: { cards: terms.map((term) => ({ term, definition: `${term} vi`, phonetic: "" })) },
  usage,
  model: "openai/gpt-oss-120b",
});
const budget = () => ({ launchUntil: Date.now() + 60_000, deadline: Date.now() + 60_000 });
function stateFor(chunks: string[], cardCount: number = options.cardCount): AiJobState {
  const tasks = planTasks(chunks.map(estimateTokens), cardCount);
  return {
    phase: "generate",
    texts: [],
    extractIndex: 0,
    pdfPageCursor: 0,
    pagesCounted: true,
    chunks,
    chunkIndex: 0,
    rawCards: [],
    usage: { input: 0, output: 0, cached: 0, cost: 0 },
    tasks,
    totalTasks: tasks.length,
  };
}
const signal = () => new AbortController().signal;
beforeEach(() => {
  provider.mockReset();
});

it("plans at most 40 cards per request and spreads cards over chunks", () => {
  const big = planTasks([2500], 200);
  expect(big).toHaveLength(5);
  expect(big.map((t) => [t.chunk, t.part, t.count])).toEqual([
    [0, 0, 40],
    [0, 1, 40],
    [0, 2, 40],
    [0, 3, 40],
    [0, 4, 40],
  ]);
  const spread = planTasks(Array<number>(10).fill(500), 20);
  expect(spread.map((t) => [t.chunk, t.count])).toEqual(
    Array.from({ length: 10 }, (_, i) => [i, 2]),
  );
  expect(planTasks([2500, 2500, 100], 200).reduce((sum, task) => sum + task.count, 0)).toBe(200);
});

it("runs every task, collects cards and usage, and tells later parts what exists", async () => {
  provider.mockResolvedValueOnce(cards("cat", "dog")).mockResolvedValueOnce(cards("fish"));
  const state = stateFor(["doc"], 80);
  await expect(advanceGeneration(state, "animals", options, signal(), budget())).resolves.toEqual({
    done: true,
  });
  expect(state.rawCards.map((c) => c.term)).toEqual(["cat", "dog", "fish"]);
  expect(state.usage.input).toBe(20);
  expect(state.tasks).toEqual([]);
  const first = JSON.parse(provider.mock.calls[0][1]);
  const second = JSON.parse(provider.mock.calls[1][1]);
  expect(first.alreadyCreatedTerms).toBeUndefined();
  expect(second.alreadyCreatedTerms).toEqual(["cat", "dog"]);
  expect(provider.mock.calls[0][5].maxTokens).toBeLessThan(8000);
});

it("runs different chunks concurrently", async () => {
  let active = 0,
    peak = 0;
  provider.mockImplementation(async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return cards(`t${Math.random()}`);
  });
  await advanceGeneration(stateFor(["a", "b", "c", "d"], 32), "", options, signal(), budget());
  expect(provider).toHaveBeenCalledTimes(4);
  expect(peak).toBe(2);
});

it("switches to the fallback model when the primary is throttled", async () => {
  provider.mockRejectedValueOnce(new RateLimitError(9000)).mockResolvedValueOnce(cards("a", "b"));
  const state = stateFor(["doc"]);
  await expect(advanceGeneration(state, "", options, signal(), budget())).resolves.toEqual({
    done: true,
  });
  expect(provider.mock.calls.map((call) => call[4])).toEqual([
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
  ]);
});

it("pauses with the shorter provider delay when both models are throttled", async () => {
  provider
    .mockRejectedValueOnce(new RateLimitError(9000))
    .mockRejectedValueOnce(new RateLimitError(4000));
  const state = stateFor(["doc"]);
  await expect(advanceGeneration(state, "", options, signal(), budget())).resolves.toEqual({
    done: false,
    completed: 0,
    total: 1,
    retryAfterMs: 4000,
  });
  expect(state.tasks).toHaveLength(1);
});

it("splits a truncated request into two smaller ones", async () => {
  provider
    .mockRejectedValueOnce(new ApiError(502, "AI_OUTPUT_TRUNCATED"))
    .mockResolvedValueOnce(cards("a", "b", "c"))
    .mockResolvedValueOnce(cards("d", "e"));
  const state = stateFor(["doc"], 10);
  await advanceGeneration(state, "", { ...options, cardCount: 10 }, signal(), budget());
  expect(provider.mock.calls.map((call) => JSON.parse(call[1]).settings.cardCount)).toEqual([
    10, 5, 5,
  ]);
  expect(state.rawCards).toHaveLength(5);
  expect(state.totalTasks).toBe(2);
});

it("drops a chunk that keeps failing but keeps the rest of the set", async () => {
  provider.mockImplementation(async (_schema, input: string) => {
    if (JSON.parse(input).document.text === "bad") throw new ApiError(502, "AI_INVALID_OUTPUT");
    return cards("a", "b");
  });
  const state = stateFor(["bad", "good"], 16);
  await expect(advanceGeneration(state, "", options, signal(), budget())).resolves.toEqual({
    done: true,
  });
  expect(state.failedTasks).toBe(1);
  expect(state.rawCards).toHaveLength(2);
});

it("fails the job with the provider's reason when nothing could be generated", async () => {
  provider.mockRejectedValue(new ApiError(400, "AI_REFUSED"));
  await expect(
    advanceGeneration(stateFor([""]), "x", options, signal(), budget()),
  ).rejects.toMatchObject({ code: "AI_REFUSED" });
});

it("starts nothing once the step's launch budget is spent", async () => {
  const state = stateFor(["doc"]);
  const result = await advanceGeneration(state, "", options, signal(), {
    launchUntil: Date.now() - 1,
    deadline: Date.now() + 10_000,
  });
  expect(result).toEqual({ done: false, completed: 0, total: 1 });
  expect(provider).not.toHaveBeenCalled();
});
it("reads every chunk even when the final card count is smaller", () => {
  expect(planTasks(Array<number>(12).fill(100), 5).map((t) => [t.chunk, t.count])).toEqual(
    Array.from({ length: 12 }, (_, i) => [i, 1]),
  );
  expect(planTasks(Array<number>(12).fill(100), 40).map((t) => t.chunk)).toEqual(
    Array.from({ length: 12 }, (_, i) => i),
  );
});
it("splits the text first when the request itself is too large", async () => {
  provider
    .mockRejectedValueOnce(new ApiError(413, "AI_INPUT_TOO_LARGE"))
    .mockResolvedValue(cards(`t${Math.random()}`, `u${Math.random()}`));
  const text = "line of document text\n".repeat(200);
  const state = stateFor([text], 10);
  await advanceGeneration(state, "", { ...options, cardCount: 10 }, signal(), budget());
  expect(state.chunks).toHaveLength(2);
  expect(provider.mock.calls.map((call) => JSON.parse(call[1]).settings.cardCount)).toEqual([
    10, 5, 5,
  ]);
});
it("asks for fewer cards when a call runs out of step time", async () => {
  provider
    .mockRejectedValueOnce(new ApiError(504, "AI_TIMEOUT"))
    .mockResolvedValueOnce(cards("a", "b"))
    .mockResolvedValueOnce(cards("c", "d"));
  const state = stateFor(["doc"], 20);
  await advanceGeneration(state, "", { ...options, cardCount: 20 }, signal(), budget());
  expect(provider.mock.calls.map((call) => JSON.parse(call[1]).settings.cardCount)).toEqual([
    20, 10, 10,
  ]);
  expect(state.failedTasks ?? 0).toBe(0);
});
