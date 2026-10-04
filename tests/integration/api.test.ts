import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import { v7 } from "uuid";
import * as schema from "@/server/db/schema";
import { GET, POST, PUT, PATCH, DELETE } from "@/app/api/v1/[...path]/route";

const state = vi.hoisted(() => ({ owner: "", authenticated: true, passwordValid: true }));
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
      getSession: async () => (state.authenticated ? { user: { id: state.owner } } : null),
      verifyPassword: async () => {
        if (!state.passwordValid) throw new Error("Invalid password");
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
  title: "Test",
  description: "",
  termLang: "en",
  definitionLang: "vi",
  source: "manual",
  cards: [
    { term: "one", definition: "một" },
    { term: "two", definition: "hai" },
  ],
};
const handlers = { GET, POST, PUT, PATCH, DELETE };
async function request(
  method: keyof typeof handlers,
  path: string,
  body?: unknown,
  origin = "http://localhost:3100",
) {
  const req = new Request(`http://localhost:3100/api/v1/${path}`, {
    method,
    headers: { Origin: origin, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return handlers[method](req, {
    params: Promise.resolve({ path: path.split("?")[0].split("/") }),
  });
}
async function create() {
  const res = await request("POST", "sets", input);
  expect(res.status).toBe(200);
  return (await res.json()).data as {
    id: string;
    cards: { id: string; term: string; definition: string }[];
  };
}
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
});
beforeEach(async () => {
  await db.execute(sql`truncate "user" cascade`);
  state.owner = v7();
  state.authenticated = true;
  state.passwordValid = true;
  await db
    .insert(schema.user)
    .values({ id: state.owner, name: "Tester", email: "tester@example.com", emailVerified: true });
});
afterAll(async () => {
  await connection.end();
});

describe("domain HTTP handlers", () => {
  it("rejects guests and foreign origins with no-store envelopes", async () => {
    state.authenticated = false;
    const guest = await request("GET", "sets");
    expect(guest.status).toBe(401);
    expect(guest.headers.get("Cache-Control")).toBe("no-store");
    expect(guest.headers.get("X-Request-Id")).toBeTruthy();
    expect((await request("POST", "sets", input, "https://untrusted.example")).status).toBe(403);
  });
  it("handles profile reads/updates and seeds samples only once", async () => {
    expect((await request("GET", "me")).status).toBe(200);
    expect((await request("GET", "me")).status).toBe(200);
    expect((await (await request("GET", "sets")).json()).data).toHaveLength(3);
    const result = await (
      await request("PATCH", "me", { displayName: "New Name", uiLocale: "en" })
    ).json();
    expect(result.data.displayName).toBe("New Name");
  });
  it("handles full CRUD and duplicates with independently owned card IDs", async () => {
    const set = await create();
    expect((await request("GET", `sets/${set.id}`)).status).toBe(200);
    expect(
      (
        await request("PUT", `sets/${set.id}`, {
          ...input,
          title: "Changed",
          cards: set.cards.toReversed(),
        })
      ).status,
    ).toBe(200);
    const duplicate = (
      await (await request("POST", `sets/${set.id}/duplicate`, { title: "Copy" })).json()
    ).data;
    expect(duplicate.cards[0].id).not.toBe(set.cards[0].id);
    expect((await request("DELETE", `sets/${set.id}`)).status).toBe(200);
    expect((await request("GET", `sets/${set.id}`)).status).toBe(404);
  });
  it("records, reads and resets progress", async () => {
    const set = await create();
    expect(
      (
        await request("PUT", `sets/${set.id}/progress`, {
          cards: [{ cardId: set.cards[0].id, status: "known" }],
        })
      ).status,
    ).toBe(200);
    expect((await (await request("GET", `sets/${set.id}/progress`)).json()).data).toHaveLength(1);
    expect((await request("DELETE", `sets/${set.id}/progress`)).status).toBe(200);
  });
  it("persists test corrections, game history and recent activity", async () => {
    const set = await create();
    const result = (
      await (
        await request("POST", `sets/${set.id}/test-results`, {
          setId: set.id,
          score: 1,
          total: 2,
          durationMs: 0,
        })
      ).json()
    ).data;
    expect((await request("PATCH", `test-results/${result.id}`, { score: 2 })).status).toBe(200);
    expect(
      (await (await request("GET", `sets/${set.id}/test-results?limit=1`)).json()).data[0].score,
    ).toBe(2);
    await request("POST", `sets/${set.id}/game-scores`, {
      setId: set.id,
      game: "match",
      score: 1,
      timeMs: 100,
    });
    expect(
      (await (await request("GET", `sets/${set.id}/game-scores?game=match`)).json()).data,
    ).toHaveLength(1);
    expect((await request("POST", `sets/${set.id}/activity`)).status).toBe(200);
    expect((await (await request("GET", "activity?limit=5")).json()).data).toHaveLength(1);
  });
  it("validates input, unsupported endpoints and malformed cursors", async () => {
    expect((await request("POST", "sets", {})).status).toBe(400);
    expect((await request("GET", "sets/not-a-uuid")).status).toBe(400);
    expect((await request("GET", "sets?cursor=malformed")).status).toBe(400);
    expect((await request("GET", "unknown")).status).toBe(404);
    expect((await request("POST", "sets/id/unknown")).status).toBe(405);
  });
  it("imports through the authenticated endpoint and ignores submitted owner IDs", async () => {
    const local = {
      ...input,
      id: "old",
      ownerId: "attacker",
      cards: input.cards.map((c, i) => ({ ...c, id: `old-${i}` })),
    };
    expect((await request("POST", "import/local", { sets: [local] })).status).toBe(200);
    expect((await (await request("GET", "sets")).json()).data[0].ownerId).toBe(state.owner);
  });
  it("soft-deletes accounts and rejects subsequent session use", async () => {
    expect((await request("DELETE", "me", { password: "correct" })).status).toBe(200);
    expect((await request("GET", "me")).status).toBe(401);
  });
});
