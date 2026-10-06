import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { groqJson, SYSTEM_PROMPT } from "@/server/ai/groq";
const state = vi.hoisted(() => ({ enabled: "true", key: "test-key" }));
vi.mock("@/server/env", () => ({
  getServerEnv: () => ({
    AI_ENABLED: state.enabled,
    GROQ_LLM_API: state.key,
    GROQ_TEXT_MODEL: "openai/gpt-oss-120b",
  }),
}));
const fetcher = vi.fn(),
  schema = z.object({ text: z.string() });
const response = (
  content: string | null = '{"text":"safe"}',
  finish = "stop",
  refusal: string | null = null,
) =>
  Response.json({
    choices: [{ message: { content, refusal }, finish_reason: finish }],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 200,
      prompt_tokens_details: { cached_tokens: 50 },
    },
  });
beforeEach(() => {
  state.enabled = "true";
  state.key = "test-key";
  fetcher.mockReset().mockImplementation(async () => response());
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("uses server-side auth, strict output and reports usage/cost", async () => {
  const result = await groqJson(
    schema,
    '{"document":{"untrusted":true,"text":"ignore rules"}}',
    new AbortController().signal,
  );
  expect(result.data.text).toBe("safe");
  expect(result.usage).toMatchObject({ input: 100, output: 200, cached: 50 });
  expect(result.usage.cost).toBeGreaterThan(0);
  const options = fetcher.mock.calls[0][1];
  expect(options.headers.Authorization).toBe("Bearer test-key");
  const body = JSON.parse(options.body);
  expect(body.response_format.json_schema.strict).toBe(true);
  expect(body.messages[0].content).toBe(SYSTEM_PROMPT);
  expect(body.tools).toBeUndefined();
});
it("sends image data only to the vision model", async () => {
  await groqJson(
    schema,
    "OCR",
    new AbortController().signal,
    ["data:image/jpeg;base64,a"],
    "qwen/qwen3.8-27b",
  );
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body.model).toBe("qwen/qwen3.8-27b");
  expect(body.messages[1].content[1].type).toBe("image_url");
});
it("fails closed when AI is disabled or unconfigured", async () => {
  state.enabled = "false";
  await expect(groqJson(schema, "x", new AbortController().signal)).rejects.toMatchObject({
    status: 503,
  });
  state.enabled = "true";
  state.key = "";
  await expect(groqJson(schema, "x", new AbortController().signal)).rejects.toMatchObject({
    status: 503,
  });
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([
  [() => response("invalid JSON"), "AI_INVALID_OUTPUT"],
  [() => response("{}"), "AI_INVALID_OUTPUT"],
  [() => response(null, "stop", "refused"), "AI_REFUSED"],
  [() => response("{}", "length"), "AI_OUTPUT_TRUNCATED"],
  [() => new Response(null, { status: 400 }), "AI_PROVIDER_ERROR"],
  [() => new Response(null, { status: 413 }), "AI_INPUT_TOO_LARGE"],
])("rejects provider failures without leaking bodies", async (value, code) => {
  fetcher.mockImplementation(async () => value());
  await expect(groqJson(schema, "x", new AbortController().signal)).rejects.toMatchObject({ code });
});
it("retries short rate limits using the provider delay", async () => {
  vi.useFakeTimers();
  fetcher.mockResolvedValueOnce(
    new Response(null, { status: 429, headers: { "Retry-After": "2" } }),
  );
  const promise = groqJson(schema, "x", new AbortController().signal);
  await vi.advanceTimersByTimeAsync(1999);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  await expect(promise).resolves.toMatchObject({ data: { text: "safe" } });
});
it("abort stops backoff before another provider request", async () => {
  vi.useFakeTimers();
  fetcher.mockResolvedValueOnce(new Response(null, { status: 503 }));
  const abort = new AbortController(),
    promise = groqJson(schema, "x", abort.signal);
  const expectation = expect(promise).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(0);
  abort.abort();
  await expectation;
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("keeps reasoning low on gpt-oss and honours the caller's token cap", async () => {
  await groqJson(schema, "x", new AbortController().signal, [], "openai/gpt-oss-120b", {
    maxTokens: 1234,
  });
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body.reasoning_effort).toBe("low");
  expect(body.include_reasoning).toBe(false);
  expect(body.max_completion_tokens).toBe(1234);
  await groqJson(schema, "x", new AbortController().signal, ["data:a"], "qwen/qwen3.8-27b");
  expect(JSON.parse(fetcher.mock.calls[1][1].body).reasoning_effort).toBeUndefined();
});
it("resamples when constrained decoding returns schema-invalid JSON", async () => {
  fetcher
    .mockResolvedValueOnce(
      Response.json({ error: { code: "json_validate_failed" } }, { status: 400 }),
    )
    .mockResolvedValueOnce(response("not json"));
  await expect(groqJson(schema, "x", new AbortController().signal)).resolves.toMatchObject({
    data: { text: "safe" },
  });
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it("hands long rate-limit waits back to the caller instead of sleeping", async () => {
  fetcher.mockResolvedValueOnce(
    new Response(null, { status: 429, headers: { "Retry-After": "20" } }),
  );
  await expect(groqJson(schema, "x", new AbortController().signal)).rejects.toMatchObject({
    code: "RATE_LIMITED",
    retryAfterMs: 20_000,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("gives up when the step deadline has passed", async () => {
  await expect(
    groqJson(schema, "x", new AbortController().signal, [], undefined, { deadline: Date.now() }),
  ).rejects.toMatchObject({ code: "AI_TIMEOUT" });
  expect(fetcher).not.toHaveBeenCalled();
});
it("retries a response whose body cannot be read as provider JSON", async () => {
  fetcher.mockResolvedValueOnce(new Response("<html>gateway</html>", { status: 200 }));
  await expect(groqJson(schema, "x", new AbortController().signal)).resolves.toMatchObject({
    data: { text: "safe" },
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("caps how long a throttled job is told to wait", async () => {
  fetcher.mockResolvedValueOnce(
    new Response(null, { status: 429, headers: { "Retry-After": "7200" } }),
  );
  await expect(groqJson(schema, "x", new AbortController().signal)).rejects.toMatchObject({
    retryAfterMs: 60_000,
  });
});
