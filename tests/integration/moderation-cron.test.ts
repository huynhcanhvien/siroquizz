import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { v7 } from "uuid";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/client";
import { ApiError } from "@/server/api-error";
import { createSetInTransaction } from "@/server/services/sets";
import { moderatePending } from "@/server/services/moderation";

const verdict = vi.hoisted(() => vi.fn());
const handle = vi.hoisted(() => ({ db: null as unknown }));
const cap = vi.hoisted(() => ({ tokens: 350_000 }));
vi.mock("@/server/ai/groq", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/ai/groq")>()),
  groqJson: verdict,
}));
vi.mock("@/server/env", () => ({
  getServerEnv: () => ({ AI_GLOBAL_DAILY_TOKENS: cap.tokens, CRON_SECRET: "cron-secret" }),
}));
vi.mock("@/server/db/client", () => ({ getDatabase: () => handle.db }));
const url =
  process.env.TEST_DATABASE_URL ??
  "postgresql://siroquizz:siroquizz_local_only@localhost:5433/siroquizz_test";
if (!new URL(url).pathname.endsWith("_test")) throw new Error("Test DB required");
const connection = postgres(url, { max: 3 }),
  db = drizzle(connection, { schema }) as Database,
  owner = v7();
handle.db = db;
const safe = {
  data: { violation: false, category: "safe", reason: "ok" },
  usage: { input: 300, output: 20, cached: 0, cost: 0 },
  model: "m",
};
const timeout = () => new DOMException("The operation timed out.", "TimeoutError");

/** Public sets waiting for the automatic check, oldest first. */
async function pendingSets(count: number) {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const set = await db.transaction((tx) =>
      createSetInTransaction(tx, owner, {
        title: `Set ${i}`,
        description: "",
        termLang: "en",
        definitionLang: "vi",
        source: "manual",
        cards: [
          { term: "cat", definition: "mèo" },
          { term: "dog", definition: "chó" },
        ],
      }),
    );
    await db
      .update(schema.studySets)
      .set({
        visibility: "public",
        moderationStatus: "pending",
        slug: `s${i}${set.id.slice(-6)}`,
        updatedAt: new Date(Date.now() - (count - i) * 1000),
      })
      .where(eq(schema.studySets.id, set.id));
    ids.push(set.id);
  }
  return ids;
}
const statuses = async (ids: string[]) =>
  (
    await db
      .select({ status: schema.studySets.moderationStatus })
      .from(schema.studySets)
      .where(inArray(schema.studySets.id, ids))
      .orderBy(asc(schema.studySets.updatedAt))
  ).map((row) => row.status);

beforeAll(() => migrate(db, { migrationsFolder: "drizzle" }));
beforeEach(async () => {
  await db.execute(sql`truncate "user" cascade`);
  await db.insert(schema.user).values({
    id: owner,
    name: "Owner",
    email: "mod-cron@example.com",
    emailVerified: true,
    createdAt: new Date(Date.now() - 2 * 86400_000),
  });
  verdict.mockReset().mockResolvedValue(safe);
  cap.tokens = 350_000;
});
afterAll(() => connection.end());

it("keeps a set pending when its check times out and still checks the next one", async () => {
  const ids = await pendingSets(2);
  verdict.mockRejectedValueOnce(timeout());
  expect(await moderatePending(db)).toEqual(["pending", "approved"]);
  expect(await statuses(ids)).toEqual(["pending", "approved"]);
  // The model is called with a deadline, never with a signal that aborts on its own.
  expect(verdict.mock.calls[0][5].deadline).toBeGreaterThan(Date.now());
});

it("isolates an unexpected failure to its own set", async () => {
  const ids = await pendingSets(3);
  verdict
    .mockResolvedValueOnce(safe)
    .mockRejectedValueOnce(new Error("driver exploded"))
    .mockRejectedValueOnce(new ApiError(429, "RATE_LIMITED"));
  expect(await moderatePending(db)).toEqual(["approved", "pending", "pending"]);
  expect(await statuses(ids)).toEqual(["approved", "pending", "pending"]);
});

it("stops starting checks when less than 10 seconds of the budget remain", async () => {
  await pendingSets(2);
  expect(await moderatePending(db, 20, Date.now() + 9_000)).toEqual([]);
  expect(verdict).not.toHaveBeenCalled();
});

it("answers the cron request with 200 even when a check times out", async () => {
  const ids = await pendingSets(2);
  verdict.mockRejectedValueOnce(timeout());
  const { GET } = await import("@/app/api/cron/cleanup/route");
  const response = await GET(
    new Request("http://localhost/api/cron/cleanup", {
      headers: { authorization: "Bearer cron-secret" },
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ success: true, data: { moderated: 2 } });
  expect(await statuses(ids)).toEqual(["pending", "approved"]);
});

it("never lets a check run past the cron deadline", async () => {
  await pendingSets(1);
  const deadline = Date.now() + 15_000;
  await moderatePending(db, 20, deadline);
  expect(verdict.mock.calls[0][5].deadline).toBeLessThanOrEqual(deadline - 3_000);
});

it("leaves sets pending without calling the model when the daily token cap is spent", async () => {
  const ids = await pendingSets(1);
  cap.tokens = 100;
  expect(await moderatePending(db)).toEqual(["pending"]);
  expect(verdict).not.toHaveBeenCalled();
  expect(await statuses(ids)).toEqual(["pending"]);
});
