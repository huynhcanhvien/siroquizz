import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getAuth } from "./auth";
import { getServerEnv } from "./env";
import { trustedOrigins } from "./env-schema";
import { ApiError } from "./api-error";
import { enforceLimit } from "./rate-limit";
import type { User } from "@/lib/types";

export function checkOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  if (!origin || !trustedOrigins(getServerEnv()).includes(origin))
    throw new ApiError(403, "FORBIDDEN");
}
export interface SessionContext {
  user: User;
  samplesSeeded: boolean;
  /** Set-Cookie values Better Auth emitted (cookie-cache refresh/expiry) that must reach the browser. */
  setCookies: string[];
}
/**
 * Reads the session from Better Auth's signed cookie cache when it is fresh, so most requests
 * skip the database entirely. `fresh` bypasses the cache and re-issues it from the database —
 * use it after changing fields the cache carries (profile, seeding, deletion).
 */
export async function getSessionContext(headers: Headers, fresh = false): Promise<SessionContext> {
  const { headers: authHeaders, response } = await getAuth().api.getSession({
    headers,
    returnHeaders: true,
    ...(fresh ? { query: { disableCookieCache: true } } : {}),
  });
  const setCookies = authHeaders.getSetCookie();
  const record = response?.user;
  if (!record || record.deletedAt || record.bannedAt || !record.emailVerified)
    throw new ApiError(401, "UNAUTHENTICATED", setCookies);
  return {
    user: {
      id: record.id,
      email: record.email,
      displayName: record.name,
      avatarColor: record.avatarColor ?? "indigo",
      uiLocale: record.uiLocale ?? "vi",
      createdAt: new Date(record.createdAt).toISOString(),
      ...(record.role === "admin" ? { role: "admin" as const } : {}),
    },
    samplesSeeded: Boolean(record.samplesSeeded),
    setCookies,
  };
}
export async function requireSession(request: Request): Promise<User> {
  return (await getSessionContext(request.headers)).user;
}
export async function readJson(request: Request, maxBytes = 2 * 1024 * 1024): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new ApiError(400, "VALIDATION_ERROR");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "VALIDATION_ERROR");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ApiError(413, "VALIDATION_ERROR");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "VALIDATION_ERROR");
  } finally {
    reader.releaseLock();
  }
}
export interface ApiContext {
  samplesSeeded: boolean;
  /** Call after changing user fields carried in the session cookie cache. */
  refreshSession: () => void;
}
export async function api(
  request: Request,
  action: (current: User, context: ApiContext) => Promise<{ data: unknown; meta?: unknown }>,
): Promise<Response> {
  const requestId = randomUUID();
  try {
    if (getServerEnv().NEXT_PUBLIC_DATA_SOURCE !== "http") throw new ApiError(404, "NOT_FOUND");
    checkOrigin(request);
    const session = await getSessionContext(request.headers);
    const current = session.user;
    if (request.method !== "GET") await enforceLimit(`write:${current.id}`);
    let shouldRefresh = false;
    const result = await action(current, {
      samplesSeeded: session.samplesSeeded,
      refreshSession: () => {
        shouldRefresh = true;
      },
    });
    const setCookies = shouldRefresh ? await refreshedCookies(request.headers) : session.setCookies;
    return Response.json(
      { success: true, ...result },
      {
        headers: withCookies(
          { "Cache-Control": "private, no-store", "X-Request-Id": requestId },
          setCookies,
        ),
      },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}
async function refreshedCookies(headers: Headers): Promise<string[]> {
  try {
    return (await getSessionContext(headers, true)).setCookies;
  } catch (error) {
    // A deleted account has no session left: Better Auth's expiry cookies still need to go out.
    if (error instanceof ApiError && error.status === 401) return [...error.setCookies];
    throw error;
  }
}
function withCookies(init: Record<string, string>, setCookies: readonly string[]): Headers {
  const headers = new Headers(init);
  for (const cookie of setCookies) headers.append("Set-Cookie", cookie);
  return headers;
}
export function apiError(error: unknown, requestId = randomUUID()) {
  const status = error instanceof ApiError ? error.status : error instanceof z.ZodError ? 400 : 500;
  const code =
    error instanceof ApiError
      ? error.code
      : error instanceof z.ZodError
        ? "VALIDATION_ERROR"
        : "INTERNAL";
  if (status === 500) console.error("API request failed", { requestId, error });
  return Response.json(
    { success: false, error: { code, message: `errors.${code}` } },
    {
      status,
      headers: withCookies(
        {
          "Cache-Control": "no-store",
          "X-Request-Id": requestId,
          ...(status === 429 ? { "Retry-After": "60" } : {}),
        },
        error instanceof ApiError ? error.setCookies : [],
      ),
    },
  );
}
