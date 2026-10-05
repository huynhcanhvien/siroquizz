import { z } from "zod";
import {
  RepositoryError,
  type RepositoryErrorCode,
  REPOSITORY_ERROR_CODES,
} from "./repository-error";

const envelopeSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    data: z.unknown(),
    meta: z.object({ nextCursor: z.string().min(1).max(512).nullable().optional() }).optional(),
  }),
  z.object({ success: z.literal(false), error: z.object({ code: z.string() }) }),
]);

const ERROR_CODES = new Map<string, RepositoryErrorCode>([
  ...REPOSITORY_ERROR_CODES.map((code): [string, RepositoryErrorCode] => [code, code]),
  ["VALIDATION_ERROR", "VALIDATION"],
  ["AI_QUOTA_EXCEEDED", "RATE_LIMITED"],
  ["INTERNAL", "UNKNOWN"],
  ["AI_OUTPUT_TRUNCATED", "AI_INVALID_OUTPUT"],
  ["AI_INPUT_TOO_LARGE", "AI_PROVIDER_ERROR"],
]);

export function mapApiErrorCode(code: string): RepositoryErrorCode {
  return ERROR_CODES.get(code) ?? "UNKNOWN";
}

function statusError(status: number): RepositoryErrorCode {
  return (
    (
      {
        400: "VALIDATION",
        401: "UNAUTHENTICATED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
        429: "RATE_LIMITED",
      } as const
    )[status as 400 | 401 | 403 | 404 | 409 | 429] ?? "UNKNOWN"
  );
}

export interface HttpResult<T> {
  data: T;
  nextCursor: string | null;
}

type RequestOptions = { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown };

export interface HttpClient {
  request<T>(path: string, schema: z.ZodType<T>, options?: RequestOptions): Promise<HttpResult<T>>;
}

/** Cookie auth stays in the browser; errors never expose server response bodies. */
export function createHttpClient(fetcher: typeof fetch = globalThis.fetch): HttpClient {
  return {
    async request<T>(path: string, schema: z.ZodType<T>, options: RequestOptions = {}) {
      if (!path.startsWith("/api/v1/") || /[\s\\#]/.test(path))
        throw new RepositoryError("VALIDATION");
      const url = new URL(path, "https://siroquizz.invalid");
      if (url.pathname !== path.split("?")[0]) throw new RepositoryError("VALIDATION");
      let response: Response;
      try {
        response = await fetcher(path, {
          method: options.method ?? "GET",
          headers: {
            Accept: "application/json",
            ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(15_000),
          ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        });
      } catch {
        throw new RepositoryError("NETWORK");
      }

      let raw: unknown;
      try {
        raw = await response.json();
      } catch {
        throw new RepositoryError(response.ok ? "UNKNOWN" : statusError(response.status));
      }
      const parsed = envelopeSchema.safeParse(raw);
      if (!response.ok) {
        // HTTP status is authoritative for session expiry and rate limiting.
        if (response.status === 401 || response.status === 429)
          throw new RepositoryError(statusError(response.status));
        const code =
          parsed.success && !parsed.data.success
            ? ERROR_CODES.get(parsed.data.error.code)
            : undefined;
        throw new RepositoryError(code ?? statusError(response.status));
      }
      if (!parsed.success) throw new RepositoryError("UNKNOWN");
      if (!parsed.data.success)
        throw new RepositoryError(ERROR_CODES.get(parsed.data.error.code) ?? "UNKNOWN");
      const result = schema.safeParse(parsed.data.data);
      if (!result.success) throw new RepositoryError("UNKNOWN");
      return { data: result.data, nextCursor: parsed.data.meta?.nextCursor ?? null };
    },
  };
}

/** Paths must treat each user-supplied ID as one segment, including dot segments. */
export function apiId(id: string): string {
  if (!id || id === "." || id === "..") throw new RepositoryError("VALIDATION");
  return encodeURIComponent(id);
}

/** Preserve the existing findAll interface while consuming bounded cursor pages. */
export async function collectPages<T>(
  client: HttpClient,
  path: string,
  schema: z.ZodType<T[]>,
  maxPages = 20,
): Promise<T[]> {
  const items: T[] = [];
  const [endpoint, existingQuery] = path.split("?");
  const cursors = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const query = new URLSearchParams(existingQuery);
    query.set("limit", "50");
    if (cursor !== null) query.set("cursor", cursor);
    const result = await client.request(`${endpoint}?${query}`, schema);
    items.push(...result.data);
    cursor = result.nextCursor;
    if (cursor === null) return items;
    if (cursors.has(cursor)) throw new RepositoryError("UNKNOWN");
    cursors.add(cursor);
  }
  // Never silently return a truncated library.
  throw new RepositoryError("UNKNOWN");
}
