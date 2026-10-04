import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getAuth } from "./auth";
import { getDatabase } from "./db/client";
import { user } from "./db/schema";
import { getServerEnv } from "./env";
import { ApiError } from "./api-error";
import { enforceLimit } from "./rate-limit";
import type { User } from "@/lib/types";

export function checkOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const expected = getServerEnv().BETTER_AUTH_URL;
  if (!expected || request.headers.get("origin") !== new URL(expected).origin)
    throw new ApiError(403, "FORBIDDEN");
}
export async function requireSession(request: Request): Promise<User> {
  const current = await getAuth().api.getSession({ headers: request.headers });
  if (!current) throw new ApiError(401, "UNAUTHENTICATED");
  const [record] = await getDatabase()
    .select()
    .from(user)
    .where(eq(user.id, current.user.id))
    .limit(1);
  if (!record || record.deletedAt || !record.emailVerified)
    throw new ApiError(401, "UNAUTHENTICATED");
  return {
    id: record.id,
    email: record.email,
    displayName: record.name,
    avatarColor: record.avatarColor,
    uiLocale: record.uiLocale,
    createdAt: record.createdAt.toISOString(),
  };
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
export async function api(
  request: Request,
  action: (current: User) => Promise<{ data: unknown; meta?: unknown }>,
): Promise<Response> {
  const requestId = randomUUID();
  try {
    if (getServerEnv().NEXT_PUBLIC_DATA_SOURCE !== "http") throw new ApiError(404, "NOT_FOUND");
    checkOrigin(request);
    const current = await requireSession(request);
    if (request.method !== "GET") await enforceLimit(`write:${current.id}`);
    const result = await action(current);
    return Response.json(
      { success: true, ...result },
      { headers: { "Cache-Control": "private, no-store", "X-Request-Id": requestId } },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
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
      headers: {
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
        ...(status === 429 ? { "Retry-After": "60" } : {}),
      },
    },
  );
}
