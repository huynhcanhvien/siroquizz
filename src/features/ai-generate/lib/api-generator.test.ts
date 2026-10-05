import { beforeEach, describe, it, expect, vi } from "vitest";
import { createApiGenerator } from "./api-generator";
import type { HttpClient } from "@/lib/http-client";
const uploadId = "019aa5b0-6ef0-7000-8000-000000000001",
  jobId = "019aa5b0-6ef0-7000-8000-000000000002";
const options = {
  cardCount: 5,
  termLang: "en",
  definitionLang: "vi",
  includePhonetic: false,
} as const;
const result = {
  cards: [
    { id: "a", term: "cat", definition: "mèo" },
    { id: "b", term: "dog", definition: "chó" },
  ],
  usedSamples: false,
  unreadFiles: [],
} as const;
const request = vi.fn(),
  fetcher = vi.fn();
const generator = () => createApiGenerator({ request } as HttpClient, fetcher as typeof fetch);
/** A /step response in the shared API envelope. */
function step(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
beforeEach(() => {
  request.mockReset().mockResolvedValue({ data: { jobId } });
  fetcher
    .mockReset()
    .mockResolvedValueOnce(step({ status: "extracting", stage: "reading" }))
    .mockResolvedValueOnce(
      step({ status: "generating", stage: "generating", completed: 1, total: 1 }),
    )
    .mockResolvedValueOnce(step({ status: "done", stage: "done", result }));
});
describe("HTTP AI generator", () => {
  it("drives steps through stages and returns validated cards", async () => {
    const stages: string[] = [];
    expect(
      await generator().generate(
        { files: [], prompt: "animals", options },
        { onStage: (s) => stages.push(s) },
      ),
    ).toEqual(result);
    expect(stages).toEqual(["uploading", "reading", "generating", "done"]);
    expect(fetcher).toHaveBeenCalledWith(
      `/api/v1/ai/jobs/${jobId}/step`,
      expect.objectContaining({ method: "POST", credentials: "same-origin" }),
    );
  });
  it("uploads binary file through a signed URL before creating a job", async () => {
    request
      .mockResolvedValueOnce({
        data: { uploadId, url: `/api/v1/ai/uploads/${uploadId}/file`, mime: "text/markdown" },
      })
      .mockResolvedValueOnce({ data: { jobId } });
    fetcher
      .mockReset()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(step({ status: "done", stage: "done", result }));
    await generator().generate({
      files: [new File(["cat - mèo"], "animals.md")],
      prompt: "",
      options,
    });
    expect(request.mock.calls[1][2].body.uploadIds).toEqual([uploadId]);
    expect(fetcher.mock.calls[0][1].credentials).toBe("same-origin");
  });
  it.each([
    ["notes.PDF", "application/pdf"],
    ["notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["scan.PNG", "image/png"],
    ["notes.MD", "text/markdown"],
    ["notes.csv", "text/csv"],
  ])("uploads %s with the correct MIME when browser metadata is empty", async (name, mime) => {
    request
      .mockResolvedValueOnce({ data: { uploadId, url: "/upload", mime } })
      .mockResolvedValueOnce({ data: { jobId } });
    fetcher
      .mockReset()
      .mockResolvedValueOnce(new Response())
      .mockResolvedValueOnce(step({ status: "done", stage: "done", result }));
    const file = new File(["document"], name);
    await generator().generate({ files: [file], prompt: "", options });
    expect(request.mock.calls[0][2].body).toEqual({ name, size: file.size, mime });
    expect(fetcher.mock.calls[0][1].headers).toEqual({ "Content-Type": mime });
  });
  it("omits cookies from HTTPS object storage upload", async () => {
    request
      .mockResolvedValueOnce({
        data: { uploadId, url: "https://storage.example/upload", mime: "text/plain" },
      })
      .mockResolvedValueOnce({ data: { jobId } });
    fetcher
      .mockReset()
      .mockResolvedValueOnce(new Response())
      .mockResolvedValueOnce(step({ status: "done", stage: "done", result }));
    await generator().generate({
      files: [new File(["x"], "a.txt", { type: "text/plain" })],
      prompt: "",
      options,
    });
    expect(fetcher.mock.calls[0][1].credentials).toBe("omit");
  });
  it("rejects insecure remote upload targets", async () => {
    request.mockResolvedValueOnce({
      data: { uploadId, url: "http://evil.test/file", mime: "text/plain" },
    });
    await expect(
      generator().generate({ files: [new File(["x"], "a.txt")], prompt: "", options }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
  it("rejects failed uploads", async () => {
    request.mockResolvedValueOnce({ data: { uploadId, url: "/upload", mime: "text/plain" } });
    fetcher.mockReset().mockResolvedValueOnce(new Response(null, { status: 400 }));
    await expect(
      generator().generate({ files: [new File(["x"], "a.txt")], prompt: "", options }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
  it("reports remote storage refusals and network failures as storage errors", async () => {
    const remote = { data: { uploadId, url: "https://store.test/put", mime: "text/plain" } };
    request.mockResolvedValueOnce(remote);
    fetcher.mockReset().mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(
      generator().generate({ files: [new File(["x"], "a.txt")], prompt: "", options }),
    ).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
    request.mockResolvedValueOnce(remote);
    fetcher.mockReset().mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(
      generator().generate({ files: [new File(["x"], "a.txt")], prompt: "", options }),
    ).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
  });
  it.each([
    [401, "UNAUTHENTICATED"],
    [500, "UNKNOWN"],
  ])("maps HTTP step failure %s", async (status, code) => {
    fetcher.mockReset().mockResolvedValueOnce(new Response(null, { status }));
    await expect(generator().generate({ files: [], prompt: "x", options })).rejects.toMatchObject({
      code,
    });
  });
  it.each([
    ["AI_QUOTA_EXCEEDED", "RATE_LIMITED"],
    ["AI_PROVIDER_ERROR", "AI_PROVIDER_ERROR"],
    ["AI_UNAVAILABLE", "AI_UNAVAILABLE"],
    ["INVALID_FILE", "INVALID_FILE"],
    ["PDF_PAGE_LIMIT", "PDF_PAGE_LIMIT"],
  ])("maps a terminal job error %s", async (error, code) => {
    fetcher
      .mockReset()
      .mockResolvedValueOnce(step({ status: "error", stage: "done", errorCode: error }));
    await expect(generator().generate({ files: [], prompt: "x", options })).rejects.toMatchObject({
      code,
    });
  });
  it("waits the provider delay before the next step and reports the wait", async () => {
    vi.useFakeTimers();
    try {
      fetcher
        .mockReset()
        .mockResolvedValueOnce(
          step({
            status: "generating",
            stage: "generating",
            completed: 1,
            total: 3,
            retryAfterMs: 5000,
          }),
        )
        .mockResolvedValueOnce(step({ status: "done", stage: "done", result }));
      const progress: unknown[] = [];
      const promise = generator().generate(
        { files: [], prompt: "x", options },
        { onStage: (_, p) => progress.push(p) },
      );
      await vi.advanceTimersByTimeAsync(4999);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(progress).toContainEqual({ completed: 1, total: 3, waiting: true });
      await vi.advanceTimersByTimeAsync(1);
      await expect(promise).resolves.toEqual(result);
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it("reports the queue position while waiting for a provider slot", async () => {
    vi.useFakeTimers();
    try {
      fetcher
        .mockReset()
        .mockResolvedValueOnce(
          step({ status: "queued", stage: "queued", queuePosition: 2, retryAfterMs: 3000 }),
        )
        .mockResolvedValueOnce(step({ status: "done", stage: "done", result }));
      const seen: unknown[] = [];
      const promise = generator().generate(
        { files: [], prompt: "x", options },
        { onStage: (stage, p) => seen.push([stage, p]) },
      );
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toEqual(result);
      expect(seen).toContainEqual(["queued", { queuePosition: 2 }]);
    } finally {
      vi.useRealTimers();
    }
  });
  it("resumes the job after a gateway timeout or dropped connection", async () => {
    vi.useFakeTimers();
    try {
      fetcher
        .mockReset()
        .mockResolvedValueOnce(new Response(null, { status: 504 }))
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValueOnce(step({ status: "done", stage: "done", result }));
      const promise = generator().generate({ files: [], prompt: "x", options });
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toEqual(result);
      expect(fetcher).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
  it("gives up after repeated transient step failures", async () => {
    vi.useFakeTimers();
    try {
      fetcher.mockReset().mockResolvedValue(new Response(null, { status: 503 }));
      const promise = generator().generate({ files: [], prompt: "x", options });
      const expectation = expect(promise).rejects.toMatchObject({ code: "UNKNOWN" });
      await vi.runAllTimersAsync();
      await expectation;
      expect(fetcher).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });
  it("asks the user to confirm the estimate, then confirms the chosen card count", async () => {
    const estimate = {
      credits: 9,
      usedCredits: 2,
      cardCount: 60,
      chunkTokens: [2500, 2500],
      quota: {
        dailyLimit: 20,
        dailyUsed: 0,
        dailyRemaining: 20,
        earned: 0,
        reserved: 0,
        available: 20,
        resetsAt: "2026-10-05T17:00:00.000Z",
      },
      maxJobCredits: 40,
    };
    fetcher
      .mockReset()
      .mockResolvedValueOnce(step({ status: "awaiting", stage: "analyzing", estimate }))
      .mockResolvedValueOnce(step({ status: "done", stage: "done", result, creditsCharged: 7 }));
    request.mockResolvedValueOnce({ data: { jobId } }).mockResolvedValueOnce({ data: null });
    const onConfirm = vi.fn(async () => 30);
    await expect(
      generator().generate({ files: [], prompt: "x", options }, { onConfirm }),
    ).resolves.toEqual({ ...result, creditsCharged: 7 });
    expect(onConfirm).toHaveBeenCalledWith(estimate);
    expect(request).toHaveBeenLastCalledWith(
      `/api/v1/ai/jobs/${jobId}/confirm`,
      expect.anything(),
      {
        method: "POST",
        body: { cardCount: 30 },
      },
    );
  });
  it("cancels the job when the user declines the estimate", async () => {
    fetcher
      .mockReset()
      .mockResolvedValueOnce(
        step({
          status: "awaiting",
          stage: "analyzing",
          estimate: {
            credits: 9,
            usedCredits: 0,
            cardCount: 60,
            chunkTokens: [2500],
            quota: {
              dailyLimit: 20,
              dailyUsed: 0,
              dailyRemaining: 20,
              earned: 0,
              reserved: 0,
              available: 20,
              resetsAt: "2026-10-05T17:00:00.000Z",
            },
            maxJobCredits: 40,
          },
        }),
      )
      .mockResolvedValue(new Response(null, { status: 200 }));
    await expect(
      generator().generate({ files: [], prompt: "x", options }, { onConfirm: async () => null }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledWith(
      `/api/v1/ai/jobs/${jobId}/cancel`,
      expect.objectContaining({ method: "POST" }),
    );
  });
  it("tells the caller whether a failed job's credits were refunded", async () => {
    fetcher.mockReset().mockResolvedValueOnce(
      step({
        status: "error",
        stage: "done",
        errorCode: "AI_PROVIDER_ERROR",
        creditsCharged: 0,
        refunded: true,
      }),
    );
    const error = await generator()
      .generate({ files: [], prompt: "x", options })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({
      code: "AI_PROVIDER_ERROR",
      cause: { creditsCharged: 0, refunded: true },
    });
  });
  it("rejects a done step that is missing its result", async () => {
    fetcher.mockReset().mockResolvedValueOnce(step({ status: "done", stage: "done" }));
    await expect(generator().generate({ files: [], prompt: "x", options })).rejects.toMatchObject({
      code: "UNKNOWN",
    });
  });
  it("continues stepping until the job reaches a terminal state", async () => {
    fetcher
      .mockReset()
      .mockResolvedValueOnce(step({ status: "extracting", stage: "reading" }))
      .mockResolvedValueOnce(
        step({ status: "generating", stage: "generating", completed: 0, total: 2 }),
      )
      .mockResolvedValueOnce(
        step({ status: "generating", stage: "generating", completed: 1, total: 2 }),
      )
      .mockResolvedValueOnce(step({ status: "validating", stage: "validating" }))
      .mockResolvedValueOnce(step({ status: "done", stage: "done", result }));
    expect(await generator().generate({ files: [], prompt: "x", options })).toEqual(result);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it("cancels a created job if abort occurs while creating it", async () => {
    const abort = new AbortController();
    request.mockImplementationOnce(async () => {
      abort.abort();
      return { data: { jobId } };
    });
    await expect(
      generator().generate({ files: [], prompt: "x", options }, { signal: abort.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledWith(
      `/api/v1/ai/jobs/${jobId}/cancel`,
      expect.objectContaining({ keepalive: true }),
    );
  });
});
