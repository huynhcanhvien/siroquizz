import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env-schema";

const httpEnv = {
  NEXT_PUBLIC_DATA_SOURCE: "http",
  DATABASE_URL: "postgresql://test:test@localhost:5432/siroquizz",
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "a".repeat(32),
};

describe("server environment", () => {
  it("keeps the existing mock app runnable without backend credentials", () => {
    expect(parseServerEnv({})).toMatchObject({
      NEXT_PUBLIC_DATA_SOURCE: "local",
      NODE_ENV: "development",
    });
  });
  it("accepts the existing Groq key spelling and strips unrelated values", () => {
    expect(parseServerEnv({ GROQ_LLM_API: " private-key ", UNRELATED: "value" })).toMatchObject({
      GROQ_LLM_API: "private-key",
    });
    expect(parseServerEnv({ UNRELATED: "value" })).not.toHaveProperty("UNRELATED");
  });
  it("treats empty optional template entries as unset", () => {
    expect(
      parseServerEnv({ GROQ_LLM_API: "", GOOGLE_CLIENT_ID: " ", BETTER_AUTH_URL: "" }).GROQ_LLM_API,
    ).toBeUndefined();
  });
  it("accepts configured HTTP development", () => {
    expect(parseServerEnv(httpEnv).NEXT_PUBLIC_DATA_SOURCE).toBe("http");
  });
  it.each(["DATABASE_URL", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET"] as const)(
    "requires %s in HTTP mode",
    (key) => {
      expect(() => parseServerEnv({ ...httpEnv, [key]: "" })).toThrow(key);
    },
  );
  it.each([
    ["NEXT_PUBLIC_DATA_SOURCE", "invalid"],
    ["NODE_ENV", "invalid"],
    ["DATABASE_URL", "sqlite://local"],
    ["DATABASE_URL", "postgresql://"],
    ["DATABASE_URL", "postgresql://localhost"],
    ["BETTER_AUTH_URL", "ftp://example.com"],
    ["BETTER_AUTH_URL", "invalid"],
    ["BETTER_AUTH_SECRET", "too-short"],
  ])("rejects invalid %s without exposing values", (key, value) => {
    expect(() => parseServerEnv({ ...httpEnv, [key]: value })).toThrow(key);
    try {
      parseServerEnv({ ...httpEnv, [key]: value });
    } catch (error) {
      expect((error as Error).message).not.toContain(value);
    }
  });
  it.each([
    { GOOGLE_CLIENT_ID: "id" },
    { GOOGLE_CLIENT_SECRET: "secret" },
    { UPSTASH_REDIS_REST_URL: "https://redis.example.com" },
    { UPSTASH_REDIS_REST_TOKEN: "token" },
  ])("rejects partially configured optional integrations: %j", (values) => {
    expect(() => parseServerEnv(values)).toThrow("Invalid server environment");
  });
  it("permits complete optional integrations", () => {
    expect(() =>
      parseServerEnv({
        GOOGLE_CLIENT_ID: "id",
        GOOGLE_CLIENT_SECRET: "secret",
        UPSTASH_REDIS_REST_URL: "https://redis.example.com",
        UPSTASH_REDIS_REST_TOKEN: "token",
      }),
    ).not.toThrow();
  });
  it("requires HTTPS, email and a distributed rate limiter in production HTTP mode", () => {
    expect(() => parseServerEnv({ ...httpEnv, NODE_ENV: "production" })).toThrow("RESEND_API_KEY");
    const production = {
      ...httpEnv,
      NODE_ENV: "production",
      BETTER_AUTH_URL: "https://siroquizz.example.com",
      RESEND_API_KEY: "email-key",
      EMAIL_FROM: "SiroQuizz <hello@example.com>",
      UPSTASH_REDIS_REST_URL: "https://redis.example.com",
      UPSTASH_REDIS_REST_TOKEN: "redis-key",
    };
    expect(() => parseServerEnv(production)).not.toThrow();
    expect(() => parseServerEnv({ ...production, BETTER_AUTH_URL: "http://example.com" })).toThrow(
      "BETTER_AUTH_URL",
    );
  });
});
