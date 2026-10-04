import "server-only";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { v7 } from "uuid";
import { getDatabase } from "./db/client";
import * as schema from "./db/schema";
import { getServerEnv } from "./env";
import { authBaseUrl, trustedOrigins } from "./env-schema";
import { sendAccountEmail } from "./email";
import { registerSchema, profileUpdateSchema, passwordSchema } from "@/features/auth/schemas";
import { after } from "next/server";

const SESSION_COOKIE_CACHE_SECONDS = 5 * 60;
let instance: ReturnType<typeof makeAuth> | undefined;
function makeAuth() {
  const env = getServerEnv();
  const baseURL = authBaseUrl(env);
  if (!env.BETTER_AUTH_SECRET || !baseURL) throw new Error("Better Auth environment is required");
  return betterAuth({
    appName: "SiroQuizz",
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDatabase(), { provider: "pg", schema, transaction: true }),
    trustedOrigins: trustedOrigins(env),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        after(() =>
          sendAccountEmail(user.email, url, "reset", (user as { uiLocale?: string }).uiLocale),
        );
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) => {
        after(() =>
          sendAccountEmail(user.email, url, "verify", (user as { uiLocale?: string }).uiLocale),
        );
      },
    },
    user: {
      additionalFields: {
        avatarColor: { type: "string", defaultValue: "indigo" },
        uiLocale: { type: "string", defaultValue: "vi" },
        deletedAt: { type: "date", required: false, input: false },
        samplesSeeded: { type: "boolean", defaultValue: false, input: false },
      },
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: async ({ user, url }) => {
          after(() =>
            sendAccountEmail(user.email, url, "change", (user as { uiLocale?: string }).uiLocale),
          );
        },
      },
    },
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
        : {},
    account: {
      accountLinking: { enabled: true, trustedProviders: ["google"], allowDifferentEmails: false },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      // Signed session+user snapshot in a cookie: most requests skip the session/user queries.
      // Revocation elsewhere (password reset, deletion on another device) lags by up to maxAge.
      cookieCache: { enabled: true, maxAge: SESSION_COOKIE_CACHE_SECONDS },
    },
    advanced: {
      ipAddress: {
        ipAddressHeaders:
          env.DEPLOYMENT_ENV === "local" ? ["x-forwarded-for"] : [env.TRUSTED_IP_HEADER],
      },
      database: { generateId: () => v7() },
      useSecureCookies: env.NODE_ENV === "production" && env.DEPLOYMENT_ENV !== "local",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 3600, max: 3 },
        "/request-password-reset": { window: 3600, max: 3 },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-up/email") {
          const b = ctx.body ?? {};
          const valid = registerSchema.safeParse({ ...b, displayName: b.name });
          if (
            !valid.success ||
            !profileUpdateSchema.safeParse({ avatarColor: b.avatarColor, uiLocale: b.uiLocale })
              .success ||
            commonPasswords.has(String(b.password).toLowerCase())
          )
            throw new APIError("BAD_REQUEST", { message: "VALIDATION_ERROR" });
          ctx.body = { ...b, email: valid.data.email, name: valid.data.displayName };
        }
        if (ctx.path === "/update-user") {
          const b = ctx.body ?? {};
          if (!profileUpdateSchema.safeParse({ ...b, displayName: b.name }).success)
            throw new APIError("BAD_REQUEST", { message: "VALIDATION_ERROR" });
        }
        if (["/reset-password", "/change-password"].includes(ctx.path)) {
          if (
            !passwordSchema.safeParse(ctx.body?.newPassword).success ||
            commonPasswords.has(String(ctx.body?.newPassword).toLowerCase())
          )
            throw new APIError("BAD_REQUEST", { message: "VALIDATION_ERROR" });
        }
      }),
    },
    databaseHooks: {
      session: {
        create: {
          before: async (entry) => {
            const [record] = await getDatabase()
              .select({ deletedAt: schema.user.deletedAt })
              .from(schema.user)
              .where(eq(schema.user.id, entry.userId));
            if (!record || record.deletedAt)
              throw new APIError("UNAUTHORIZED", { message: "INVALID_CREDENTIALS" });
            return { data: entry };
          },
        },
      },
    },
  });
}
const commonPasswords = new Set([
  "password1",
  "password123",
  "password1234",
  "12345678",
  "qwerty123",
  "abc12345",
  "welcome1",
  "admin123",
  "letmein1",
]);
export function getAuth() {
  return (instance ??= makeAuth());
}
