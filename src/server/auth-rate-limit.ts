import "server-only";
import { createHash } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { BetterAuthRateLimitOptions } from "better-auth";

type AuthRateLimitStorage = NonNullable<BetterAuthRateLimitOptions["customStorage"]>;
type UpstashEnv = { UPSTASH_REDIS_REST_URL?: string; UPSTASH_REDIS_REST_TOKEN?: string };

/**
 * Better Auth's default rate-limit store is per-process memory, so every Vercel instance had
 * its own sign-in budget. This shares one fixed window per rule in Upstash across instances.
 *
 * It is a `customStorage` rather than Better Auth's `secondaryStorage`, because configuring a
 * secondary storage also moves sessions and verification tokens out of Postgres.
 */
export function createAuthRateLimitStorage(
  env: UpstashEnv,
  now: () => number = Date.now,
): AuthRateLimitStorage | undefined {
  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = env;
  if (!url || !token) return undefined;
  const redis = new Redis({ url, token });
  const limiters = new Map<string, Ratelimit>();
  const limiterFor = (window: number, max: number) => {
    const prefix = `siroquizz:auth:${max}:${window}`;
    const existing = limiters.get(prefix);
    if (existing) return existing;
    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(max, `${window} s`),
      prefix,
    });
    limiters.set(prefix, limiter);
    return limiter;
  };
  return {
    async consume(key, rule) {
      // The key holds the client IP; store only its hash.
      const hashed = createHash("sha256").update(key).digest("hex");
      const { success, reset } = await limiterFor(rule.window, rule.max).limit(hashed);
      if (success) return { allowed: true, retryAfter: null };
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((reset - now()) / 1000)) };
    },
  };
}
