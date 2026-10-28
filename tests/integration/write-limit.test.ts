import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq, sql } from "drizzle-orm";
import { v7 } from "uuid";
import * as schema from "@/server/db/schema";
import { POST, PUT } from "@/app/api/v1/[...path]/route";

// The real in-memory limiter runs here (no Upstash env), so the buckets are the ones production uses.
const state = vi.hoisted(() => ({ owner: "" }));
vi.mock("@/server/env", () => ({
  getServerEnv: () => ({
    NEXT_PUBLIC_DATA_SOURCE: "http",
    BETTER_AUTH_URL: "http://localhost:3100",
    NODE_ENV: "test",
  }),
}));
vi.mock("@/server/auth", () => ({
  getAuth: () => ({
    api: {
      getSession: async (options: { returnHeaders?: boolean }) => {
        const [record] = await db.select().from(schema.user).where(eq(schema.user.id, state.owner));
        const response = record ? { user: record, session: { createdAt: new Date() } } : null;
        return options.returnHeaders ? { headers: new Headers(), response } : response;
      },
    },
  }),
}));
vi.mock("@/server/db/client", () => ({ getDatabase: () => db }));
const url =
  process.env.TEST_DATABASE_URL ??
  "postgresql://siroquizz:siroquizz_local_only@localhost:5433/siroquizz_test";
if (!new URL(url).pathname.endsWith("_test")) throw new Error("Use a dedicated _test database");
const connection = postgres(url, { max: 1 });
const db = drizzle(connection, { schema });
const input = {
  title: "Limits",
  description: "",
  termLang: "en",
  definitionLang: "vi",
  source: "manual",
  cards: [
    { term: "one", definition: "một" },
    { term: "two", definition: "hai" },
  ],
};
function call(handler: typeof POST, method: string, path: string, body: unknown) {
  return handler(
    new Request(`http://localhost:3100/api/v1/${path}`, {
      method,
      headers: { Origin: "http://localhost:3100", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ path: path.split("/") }) },
  );
}

beforeAll(() => migrate(db, { migrationsFolder: "drizzle" }));
beforeEach(async () => {
  await db.execute(sql`truncate "user" cascade`);
  state.owner = v7();
  await db
    .insert(schema.user)
    .values({ id: state.owner, name: "Fast", email: "fast@example.com", emailVerified: true });
});
afterAll(() => connection.end());

it("lets a learner swipe more than 60 cards a minute", async () => {
  const created = await (await call(POST, "POST", "sets", input)).json();
  const { id, cards } = created.data as { id: string; cards: { id: string }[] };
  for (let i = 0; i < 61; i++) {
    const res = await call(PUT, "PUT", `sets/${id}/progress`, {
      cards: [{ cardId: cards[i % 2].id, status: "new" }],
    });
    expect(res.status).toBe(200);
  }
});

it("still caps generic writes at 60 a minute", async () => {
  const statuses: number[] = [];
  for (let i = 0; i < 61; i++) statuses.push((await call(POST, "POST", "sets", input)).status);
  expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
  expect(statuses[60]).toBe(429);
});
