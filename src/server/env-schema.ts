import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && !value.trim() ? undefined : value),
  z.string().trim().min(1).optional(),
);

const optionalUrl = optionalString.pipe(z.url({ protocol: /^https?$/ }).optional());

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DEPLOYMENT_ENV: z.enum(["local", "preview", "production"]).optional(),
    NEXT_PUBLIC_DATA_SOURCE: z.enum(["local", "http"]).default("local"),
    DATABASE_URL: optionalString,
    BETTER_AUTH_URL: optionalUrl,
    BETTER_AUTH_SECRET: optionalString,
    RESEND_API_KEY: optionalString,
    EMAIL_FROM: optionalString,
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    UPSTASH_REDIS_REST_URL: optionalUrl,
    UPSTASH_REDIS_REST_TOKEN: optionalString,
    // Existing project spelling. Never prefix this secret with NEXT_PUBLIC_.
    GROQ_LLM_API: optionalString,
    GROQ_TEXT_MODEL: z.string().default("openai/gpt-oss-120b"),
    GROQ_VISION_MODEL: z.string().default("qwen/qwen3.8-27b"),
    AI_ENABLED: z.enum(["true", "false"]).default("true"),
    S3_ENDPOINT: optionalUrl,
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    S3_BUCKET: optionalString,
    S3_REGION: z.string().default("auto"),
    SMTP_HOST: z.string().default("127.0.0.1"),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    // Shared secret Vercel Cron presents as a bearer token when invoking /api/cron/*.
    CRON_SECRET: optionalString,
    TRUSTED_IP_HEADER: z
      .enum(["x-vercel-forwarded-for", "cf-connecting-ip", "x-real-ip"])
      .default("x-vercel-forwarded-for"),
    // System variables Vercel injects into every deployment (hostnames, no protocol).
    // Kept as a free string: an unexpected platform value must never fail env validation.
    VERCEL_ENV: optionalString,
    VERCEL_URL: optionalString,
    VERCEL_BRANCH_URL: optionalString,
  })
  .superRefine((env, ctx) => {
    const issue = (key: keyof typeof env, message: string) =>
      ctx.addIssue({ code: "custom", path: [key], message });

    if (env.DATABASE_URL) {
      try {
        const url = new URL(env.DATABASE_URL);
        if (!/^postgres(?:ql)?:$/.test(url.protocol) || !url.hostname || url.pathname.length < 2) {
          issue("DATABASE_URL", "Must be a PostgreSQL connection URL with a database name");
        }
      } catch {
        issue("DATABASE_URL", "Must be a PostgreSQL connection URL");
      }
    }
    if (env.BETTER_AUTH_SECRET && env.BETTER_AUTH_SECRET.length < 32) {
      issue("BETTER_AUTH_SECRET", "Must contain at least 32 characters");
    }
    for (const [left, right] of [
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    ] as const) {
      if (Boolean(env[left]) !== Boolean(env[right]))
        issue(left, `Configure both ${left} and ${right}`);
    }
    const storageFields = [
      "S3_ENDPOINT",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
      "S3_BUCKET",
    ] as const;
    if (storageFields.some((key) => env[key]))
      for (const key of storageFields) if (!env[key]) issue(key, "Required for S3 storage");
    if (env.NEXT_PUBLIC_DATA_SOURCE !== "http") return;

    for (const key of ["DATABASE_URL", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET"] as const) {
      if (!env[key]) issue(key, "Required for HTTP data source");
    }
    if (env.NODE_ENV === "production" && env.DEPLOYMENT_ENV !== "local") {
      for (const key of [
        "RESEND_API_KEY",
        "EMAIL_FROM",
        "UPSTASH_REDIS_REST_URL",
        "UPSTASH_REDIS_REST_TOKEN",
      ] as const) {
        if (!env[key]) issue(key, "Required for production HTTP data source");
      }
      if (env.BETTER_AUTH_URL && !env.BETTER_AUTH_URL.startsWith("https://")) {
        issue("BETTER_AUTH_URL", "HTTPS is required in production");
      }
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Report field names only: validation errors must never include secret values. */
export function parseServerEnv(values: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(values);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Invalid server environment: ${fields.join(", ")}`);
  }
  return result.data;
}

/**
 * Origins allowed to make authenticated writes. A Vercel preview is served from generated hosts
 * (per-deployment and per-branch), so those are trusted there in addition to BETTER_AUTH_URL.
 */
export function trustedOrigins(env: ServerEnv): string[] {
  const origins = new Set<string>();
  if (env.BETTER_AUTH_URL) origins.add(new URL(env.BETTER_AUTH_URL).origin);
  if (env.VERCEL_ENV === "preview")
    for (const host of [env.VERCEL_BRANCH_URL, env.VERCEL_URL])
      if (host) origins.add(`https://${host}`);
  return [...origins];
}

/** Better Auth's public URL: on a preview, links in emails must point back at that preview. */
export function authBaseUrl(env: ServerEnv): string | undefined {
  if (env.VERCEL_ENV === "preview" && env.VERCEL_BRANCH_URL)
    return `https://${env.VERCEL_BRANCH_URL}`;
  return env.BETTER_AUTH_URL;
}
