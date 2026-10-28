import { beforeEach, describe, expect, it, vi } from "vitest";

const { limits, created } = vi.hoisted(() => ({
  limits: vi.fn(),
  created: [] as { prefix: string; limiter: unknown }[],
}));
vi.mock("server-only", () => ({}));
vi.mock("@upstash/redis", () => ({ Redis: class {} }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static fixedWindow = (max: number, window: string) => ({ max, window });
    prefix: string;
    constructor(options: { prefix: string; limiter: unknown }) {
      this.prefix = options.prefix;
      created.push(options);
    }
    limit(key: string) {
      return limits(this.prefix, key);
    }
  },
}));

import { createAuthRateLimitStorage } from "./auth-rate-limit";

const env = { UPSTASH_REDIS_REST_URL: "https://redis.test", UPSTASH_REDIS_REST_TOKEN: "token" };
const now = () => 1_000_000;

beforeEach(() => {
  limits.mockReset();
  created.length = 0;
});

describe("createAuthRateLimitStorage", () => {
  it("is absent without Upstash credentials, so Better Auth keeps its own storage", () => {
    expect(createAuthRateLimitStorage({})).toBeUndefined();
    expect(createAuthRateLimitStorage({ UPSTASH_REDIS_REST_URL: "https://redis.test" })).toBe(
      undefined,
    );
  });

  it("allows a request while the shared Upstash window has room", async () => {
    limits.mockResolvedValue({ success: true, reset: 1_060_000 });
    const storage = createAuthRateLimitStorage(env, now)!;
    expect(await storage.consume("1.2.3.4|/sign-in/email", { window: 60, max: 5 })).toEqual({
      allowed: true,
      retryAfter: null,
    });
    expect(created[0]).toMatchObject({
      prefix: "siroquizz:auth:5:60",
      limiter: { max: 5, window: "60 s" },
    });
  });

  it("denies with the seconds left until the window resets", async () => {
    limits.mockResolvedValue({ success: false, reset: 1_042_100 });
    const storage = createAuthRateLimitStorage(env, now)!;
    expect(await storage.consume("ip|/sign-up/email", { window: 3600, max: 3 })).toEqual({
      allowed: false,
      retryAfter: 43,
    });
  });

  it("hashes the IP-bearing key and reuses one limiter per rule", async () => {
    limits.mockResolvedValue({ success: true, reset: 0 });
    const storage = createAuthRateLimitStorage(env, now)!;
    await storage.consume("1.2.3.4|/sign-in/email", { window: 60, max: 5 });
    await storage.consume("5.6.7.8|/sign-in/email", { window: 60, max: 5 });
    await storage.consume("1.2.3.4|/get-session", { window: 60, max: 100 });
    expect(created.map((options) => options.prefix)).toEqual([
      "siroquizz:auth:5:60",
      "siroquizz:auth:100:60",
    ]);
    const [, key] = limits.mock.calls[0];
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toBe(limits.mock.calls[1][1]);
  });
});
