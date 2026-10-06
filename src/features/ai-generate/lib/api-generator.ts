import { z } from "zod";
import { createHttpClient, mapApiErrorCode, type HttpClient } from "@/lib/http-client";
import { RepositoryError } from "@/lib/repository-error";
import { getFileMime } from "./file-validation";
import { jobStepSchema } from "../schemas";
import type { CardGenerator, GenerateHandlers, GenerateResult } from "./generator";

type JobStep = z.infer<typeof jobStepSchema>;
const MAX_STEP_RETRIES = 3;
const STEP_RETRY_DELAY_MS = 2_000;
// Gateway and platform errors from a step that was cut short; the job itself is still intact.
const TRANSIENT_STEP_STATUSES = [502, 503, 504];
const stepEnvelope = z.object({ success: z.literal(true), data: jobStepSchema });

/** A step that failed for reasons unrelated to the job; sending it again is safe. */
class TransientStepError extends Error {
  constructor(public readonly code: "NETWORK" | "UNKNOWN") {
    super(code);
  }
}
function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", aborted);
      resolve();
    }, ms);
    const aborted = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", aborted, { once: true });
  });
}
/**
 * Runs one job step. The shared JSON client is not used because a step may legitimately run for
 * tens of seconds and must honour the caller's abort signal rather than the client's short timeout.
 */
async function postStep(
  fetcher: typeof fetch,
  jobId: string,
  signal: AbortSignal,
): Promise<JobStep> {
  let response: Response;
  try {
    response = await fetcher(`/api/v1/ai/jobs/${jobId}/step`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: "{}",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new TransientStepError("NETWORK");
  }
  if (TRANSIENT_STEP_STATUSES.includes(response.status)) throw new TransientStepError("UNKNOWN");
  if (!response.ok) {
    let code: string | undefined;
    try {
      code = z.object({ error: z.object({ code: z.string() }) }).safeParse(await response.json())
        .data?.error.code;
    } catch {
      code = undefined;
    }
    throw new RepositoryError(
      response.status === 401
        ? "UNAUTHENTICATED"
        : response.status === 429
          ? "RATE_LIMITED"
          : code
            ? mapApiErrorCode(code)
            : "UNKNOWN",
    );
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new RepositoryError("UNKNOWN");
  }
  const parsed = stepEnvelope.safeParse(raw);
  if (!parsed.success) throw new RepositoryError("UNKNOWN");
  return parsed.data.data;
}
/** Stops a job on the server; sent with keepalive so it still goes out while the page closes. */
function cancelOnServer(fetcher: typeof fetch, jobId: string) {
  void fetcher(`/api/v1/ai/jobs/${jobId}/cancel`, {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }).catch(() => {});
}

/**
 * Drives a job across several short requests so no single call hits the serverless time limit,
 * until it reaches a terminal state. Every step resumes from saved server state, so a step that
 * dies mid-way (gateway timeout, dropped connection, closed tab) is simply sent again.
 */
async function driveJob(
  client: HttpClient,
  fetcher: typeof fetch,
  jobId: string,
  handlers: GenerateHandlers,
  signal: AbortSignal,
): Promise<GenerateResult> {
  let failures = 0;
  for (;;) {
    signal.throwIfAborted();
    let step: JobStep;
    try {
      step = await postStep(fetcher, jobId, signal);
      failures = 0;
    } catch (error) {
      if (!(error instanceof TransientStepError)) throw error;
      if (++failures > MAX_STEP_RETRIES) throw new RepositoryError(error.code);
      await delay(STEP_RETRY_DELAY_MS * failures, signal);
      continue;
    }
    handlers.onStage?.(step.stage, {
      completed: step.completed,
      total: step.total,
      ...(step.queuePosition
        ? { queuePosition: step.queuePosition }
        : step.retryAfterMs
          ? { waiting: true }
          : {}),
    });
    if (step.status === "done") {
      if (step.result)
        return step.creditsCharged === undefined
          ? step.result
          : { ...step.result, creditsCharged: step.creditsCharged };
      throw new RepositoryError("UNKNOWN");
    }
    if (step.status === "error" || step.status === "cancelled")
      throw new RepositoryError(mapApiErrorCode(step.errorCode ?? "AI_CANCELLED"), undefined, {
        cause: { creditsCharged: step.creditsCharged, refunded: step.refunded },
      });
    if (step.status === "awaiting") {
      // The document is read; the user decides whether the estimated credits are worth it.
      if (!step.estimate || !handlers.onConfirm) throw new RepositoryError("UNKNOWN");
      const cardCount = await handlers.onConfirm(step.estimate);
      signal.throwIfAborted();
      if (cardCount === null) {
        cancelOnServer(fetcher, jobId);
        throw new DOMException("Cancelled", "AbortError");
      }
      await client.request(`/api/v1/ai/jobs/${jobId}/confirm`, z.null(), {
        method: "POST",
        body: { cardCount },
      });
      continue;
    }
    // Queued behind other jobs or throttled by the free AI tier; the server says when to retry.
    if (step.retryAfterMs) await delay(step.retryAfterMs, signal);
  }
}

export function createApiGenerator(
  client: HttpClient = createHttpClient(),
  fetcher: typeof fetch = globalThis.fetch,
): CardGenerator {
  /** Runs `work` for a job; aborting the signal cancels the job on the server. */
  const withCancel = async <T>(
    handlers: GenerateHandlers,
    work: (signal: AbortSignal, setJob: (id: string) => void) => Promise<T>,
  ) => {
    const signal = handlers.signal ?? new AbortController().signal;
    let jobId: string | null = null;
    const cancel = () => {
      if (jobId) cancelOnServer(fetcher, jobId);
    };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      return await work(signal, (id) => {
        jobId = id;
        handlers.onJob?.(id);
        if (signal.aborted) cancel();
      });
    } finally {
      signal.removeEventListener("abort", cancel);
    }
  };

  return {
    generate: (request, handlers = {}) =>
      withCancel(handlers, async (signal, setJob) => {
        signal.throwIfAborted();
        handlers.onStage?.("uploading");
        const uploadIds: string[] = [];
        for (const file of request.files) {
          signal.throwIfAborted();
          const mime = getFileMime(file);
          const { data } = await client.request(
            "/api/v1/ai/uploads",
            z.object({ uploadId: z.uuid(), url: z.string(), mime: z.string() }),
            { method: "POST", body: { name: file.name, size: file.size, mime } },
          );
          const target = new URL(data.url, window.location.origin);
          if (target.origin !== window.location.origin && target.protocol !== "https:")
            throw new RepositoryError("VALIDATION");
          const sameOrigin = target.origin === window.location.origin;
          let response: Response;
          try {
            response = await fetcher(data.url, {
              method: "PUT",
              headers: { "Content-Type": data.mime },
              body: file,
              signal,
              credentials: sameOrigin ? "same-origin" : "omit",
              redirect: "error",
            });
          } catch (error) {
            if (signal.aborted) throw error;
            // Remote object storage unreachable or blocked by CORS.
            throw new RepositoryError(sameOrigin ? "NETWORK" : "STORAGE_UNAVAILABLE");
          }
          // Our own upload route rejects bad files; a remote store refusing means misconfiguration.
          if (!response.ok)
            throw new RepositoryError(sameOrigin ? "VALIDATION" : "STORAGE_UNAVAILABLE");
          uploadIds.push(data.uploadId);
        }
        signal.throwIfAborted();
        const { data } = await client.request("/api/v1/ai/jobs", z.object({ jobId: z.uuid() }), {
          method: "POST",
          body: { uploadIds, prompt: request.prompt, options: request.options },
        });
        setJob(data.jobId);
        return driveJob(client, fetcher, data.jobId, handlers, signal);
      }),

    resume: (jobId, handlers = {}) =>
      withCancel(handlers, (signal, setJob) => {
        setJob(jobId);
        return driveJob(client, fetcher, jobId, handlers, signal);
      }),
  };
}
