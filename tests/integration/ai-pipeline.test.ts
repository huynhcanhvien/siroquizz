import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq, sql } from "drizzle-orm";
import { v7 } from "uuid";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/client";
import type { AiJobState } from "@/features/ai-generate/schemas";
import { estimateTokens } from "@/features/ai-generate/lib/output";
import { createJob, stepJob, type StepResult } from "@/server/ai/jobs";

const provider = vi.hoisted(() => vi.fn());
const files = vi.hoisted(() => new Map<string, Buffer>());
vi.mock("@/server/ai/groq", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/ai/groq")>()),
  groqJson: provider,
}));
vi.mock("@/server/ai/storage", () => ({
  getUpload: vi.fn(async (key: string) => files.get(key)!),
}));
vi.mock("@/server/env", () => ({
  getServerEnv: () => ({
    AI_ENABLED: "true",
    GROQ_TEXT_MODEL: "openai/gpt-oss-120b",
    GROQ_FALLBACK_MODEL: "openai/gpt-oss-20b",
    AI_MAX_ACTIVE_JOBS: 20,
    AI_GLOBAL_DAILY_TOKENS: 10_000_000,
  }),
}));
const url =
  process.env.TEST_DATABASE_URL ??
  "postgresql://siroquizz:siroquizz_local_only@localhost:5433/siroquizz_test";
if (!new URL(url).pathname.endsWith("_test")) throw new Error("Test DB required");
const connection = postgres(url, { max: 3 }),
  db = drizzle(connection, { schema }) as Database,
  owner = v7();
const options = { cardCount: 5, termLang: "en", definitionLang: "vi", includePhonetic: false };
const usage = { input: 100, output: 100, cached: 0, cost: 0.0001 };
let counter = 0;
/** A provider that answers every generation request with fresh, distinct cards. */
const freshCards = async () => ({
  data: {
    cards: [0, 1].map(() => {
      counter++;
      return { term: `term${counter}`, definition: `nghĩa ${counter}`, phonetic: "" };
    }),
  },
  usage,
  model: "openai/gpt-oss-120b",
});
async function upload(name: string, mime: string, bytes: Buffer) {
  const id = v7();
  files.set(`uploads/${id}`, bytes);
  await db.insert(schema.aiUploads).values({
    id,
    userId: owner,
    key: `uploads/${id}`,
    name,
    mime,
    size: bytes.length,
    expiresAt: new Date(Date.now() + 60_000),
  });
  return id;
}
const jobState = async (jobId: string) =>
  (await db.select().from(schema.aiJobs).where(eq(schema.aiJobs.id, jobId)))[0]
    .state as AiJobState | null;
async function runToEnd(jobId: string): Promise<StepResult> {
  for (let i = 0; i < 60; i++) {
    const result = await stepJob(db, owner, jobId, new AbortController().signal);
    if (["done", "error", "cancelled", "awaiting"].includes(result.status)) return result;
  }
  throw new Error("job did not finish");
}
/** About `tokens` estimated tokens of distinct English lines. */
const longText = (tokens: number) =>
  Array.from({ length: Math.ceil((tokens * 2.5) / 61) }, (_, i) =>
    `Paragraph ${i} explains vocabulary item number ${i}.`.padEnd(60, "."),
  ).join("\n");

beforeAll(() => migrate(db, { migrationsFolder: "drizzle" }));
beforeEach(async () => {
  await db.execute(sql`truncate "user", ai_result_cache cascade`);
  await db
    .insert(schema.user)
    .values({ id: owner, name: "Owner", email: "pipeline@example.com", emailVerified: true });
  files.clear();
  provider.mockReset().mockImplementation(freshCards);
});
afterAll(() => connection.end());

it("reads a long document asked for few cards in fewer, larger requests", async () => {
  const text = longText(60_000);
  const uploadId = await upload("notes.txt", "text/plain", Buffer.from(text));
  const { jobId } = await createJob(db, owner, { prompt: "Cards", options, uploadIds: [uploadId] });
  const first = await stepJob(db, owner, jobId, new AbortController().signal);
  expect(first.status).toBe("generating");
  const state = (await jobState(jobId))!;
  // 2,500-token chunks would be 24+ requests for 5 cards; merged parts stay under the TPM cap.
  expect(state.chunks!.length).toBeLessThanOrEqual(10);
  expect(state.chunks!.join("")).toBe(text);
  expect(Math.max(...state.chunks!.map(estimateTokens))).toBeLessThanOrEqual(6500);
  expect(state.tasks).toHaveLength(state.chunks!.length);
  const done = await runToEnd(jobId);
  expect(done).toMatchObject({ status: "done" });
  expect(done.result?.cards).toHaveLength(5);
  expect(provider).toHaveBeenCalledTimes(state.chunks!.length);
});
