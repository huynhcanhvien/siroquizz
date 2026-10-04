import { z } from "zod";
import { createHttpClient, type HttpClient } from "@/lib/http-client";
import { RepositoryError } from "@/lib/repository-error";
import { userSchema } from "./schemas";
import type { AuthRepository } from "./repository";

const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  createdAt: z.string(),
  avatarColor: z.string().optional(),
  uiLocale: z.string().optional(),
});
const errorMap = new Map([
  ["INVALID_EMAIL_OR_PASSWORD", "INVALID_CREDENTIALS"],
  ["EMAIL_NOT_VERIFIED", "EMAIL_NOT_VERIFIED"],
  ["VALIDATION_ERROR", "VALIDATION"],
  ["PASSWORD_TOO_SHORT", "VALIDATION"],
  ["PASSWORD_TOO_LONG", "VALIDATION"],
  ["INVALID_PASSWORD", "INVALID_CREDENTIALS"],
  ["INVALID_TOKEN", "VALIDATION"],
] as const);

/** Better Auth's own API has a different envelope than our domain API. */
export async function authRequest(
  path: string,
  body?: unknown,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(`/api/auth/${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers:
        body === undefined
          ? { Accept: "application/json" }
          : { Accept: "application/json", "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new RepositoryError("NETWORK");
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new RepositoryError(response.status === 429 ? "RATE_LIMITED" : "UNKNOWN");
  }
  if (!response.ok) {
    const code = z.object({ code: z.string() }).safeParse(data);
    throw new RepositoryError(
      response.status === 429
        ? "RATE_LIMITED"
        : code.success
          ? (errorMap.get(code.data.code as Parameters<typeof errorMap.get>[0]) ?? "UNKNOWN")
          : "UNKNOWN",
    );
  }
  return data;
}
function appUser(raw: unknown) {
  const parsed = authUserSchema.safeParse(raw);
  if (!parsed.success) throw new RepositoryError("UNKNOWN");
  const user = parsed.data;
  return {
    id: user.id,
    email: user.email,
    displayName: user.name,
    avatarColor: user.avatarColor ?? "indigo",
    uiLocale: user.uiLocale ?? "vi",
    createdAt: user.createdAt,
  };
}
export function createHttpAuthRepository(client: HttpClient = createHttpClient()): AuthRepository {
  return {
    async getSession() {
      try {
        return (await client.request("/api/v1/me", userSchema)).data;
      } catch (error) {
        if (error instanceof RepositoryError && error.code === "UNAUTHENTICATED") return null;
        throw error;
      }
    },
    async register(input, uiLocale) {
      const result = z.object({ user: z.unknown() }).parse(
        await authRequest("sign-up/email", {
          ...input,
          name: input.displayName,
          uiLocale,
          callbackURL: "/verify-email",
        }),
      );
      return appUser(result.user);
    },
    async login(input) {
      const result = z.object({ user: z.unknown() }).parse(
        await authRequest("sign-in/email", {
          email: input.email,
          password: input.password,
          rememberMe: input.remember,
        }),
      );
      return appUser(result.user);
    },
    async logout() {
      await authRequest("sign-out", {});
    },
    async requestPasswordReset(email) {
      await authRequest("request-password-reset", { email, redirectTo: "/reset-password" });
    },
    async updateProfile(update) {
      return (await client.request("/api/v1/me", userSchema, { method: "PATCH", body: update }))
        .data;
    },
  };
}
