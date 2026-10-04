import { z } from "zod";
import { createHttpClient, mapApiErrorCode, type HttpClient } from "@/lib/http-client";
import { RepositoryError } from "@/lib/repository-error";
import { getFileMime } from "./file-validation";
import { jobStepSchema } from "../schemas";
import type { CardGenerator } from "./generator";
export function createApiGenerator(
  client: HttpClient = createHttpClient(),
  fetcher: typeof fetch = globalThis.fetch,
): CardGenerator {
  return {
    async generate(request, handlers = {}) {
      const signal = handlers.signal ?? new AbortController().signal;
      let jobId: string | null = null;
      const cancel = () => {
        if (jobId)
          void fetcher(`/api/v1/ai/jobs/${jobId}/cancel`, {
            method: "POST",
            credentials: "same-origin",
            keepalive: true,
            headers: { "Content-Type": "application/json" },
            body: "{}",
          }).catch(() => {});
      };
      signal.addEventListener("abort", cancel, { once: true });
      try {
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
        jobId = data.jobId;
        if (signal.aborted) {
          cancel();
          signal.throwIfAborted();
        }
        // Drive the job across several short requests so no single call hits the serverless
        // time limit; repeat until the job reaches a terminal state. The shared JSON client is
        // unused here because a step may legitimately run for tens of seconds and must honour the
        // caller's abort signal rather than the client's short internal timeout.
        const envelope = z.object({ success: z.literal(true), data: jobStepSchema });
        for (;;) {
          signal.throwIfAborted();
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
            throw new RepositoryError("NETWORK");
          }
          if (!response.ok) {
            let code: string | undefined;
            try {
              code = z
                .object({ error: z.object({ code: z.string() }) })
                .safeParse(await response.json()).data?.error.code;
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
          const parsed = envelope.safeParse(raw);
          if (!parsed.success) throw new RepositoryError("UNKNOWN");
          const step = parsed.data.data;
          handlers.onStage?.(step.stage, { completed: step.completed, total: step.total });
          if (step.status === "done") {
            if (step.result) return step.result;
            throw new RepositoryError("UNKNOWN");
          }
          if (step.status === "error" || step.status === "cancelled")
            throw new RepositoryError(mapApiErrorCode(step.errorCode ?? "AI_CANCELLED"));
        }
      } finally {
        signal.removeEventListener("abort", cancel);
      }
    },
  };
}
