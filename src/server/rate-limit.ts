import "server-only";
import { createHash } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getServerEnv } from "./env";
import { ApiError } from "./api-error";

const memory = new Map<string, { count: number; reset: number }>();
const distributed = new Map<string, Ratelimit>();
export async function enforceLimit(identifier: string, max = 60, seconds = 60) {
  const env = getServerEnv();
  const key = createHash("sha256").update(identifier).digest("hex");
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    const policy = `${max}:${seconds}`;
    let limiter = distributed.get(policy);
    if (!limiter) {
      limiter = new Ratelimit({
        redis: new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN }),
        limiter: Ratelimit.fixedWindow(max, `${seconds} s`),
        prefix: `siroquizz:${policy}`,
      });
      distributed.set(policy, limiter);
    }
    if (!(await limiter.limit(key)).success) throw new ApiError(429, "RATE_LIMITED");
    return;
  }
  if (
    env.NODE_ENV === "production" &&
    env.DEPLOYMENT_ENV !== "local" &&
    env.NEXT_PUBLIC_DATA_SOURCE === "http"
  )
    throw new Error("Distributed rate limiting is required");
  const now = Date.now();
  for (const [entryKey, entry] of memory) if (entry.reset <= now) memory.delete(entryKey);
  if (memory.size >= 10_000 && !memory.has(key)) throw new ApiError(429, "RATE_LIMITED");
  const entry = memory.get(key) ?? { count: 0, reset: now + seconds * 1000 };
  entry.count++;
  memory.set(key, entry);
  if (entry.count > max) throw new ApiError(429, "RATE_LIMITED");
}
