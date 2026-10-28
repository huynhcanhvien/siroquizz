import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import { v7 } from "uuid";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/client";
import { communityApi } from "@/server/community-api";
import { enforceLimit } from "@/server/rate-limit";
import { GET as getImage } from "@/app/api/v1/images/[id]/route";
import { createFolder, addSetToFolder } from "@/server/services/folders";
import { insertCast, makeClass, makeSet, newCast } from "./helpers/collab";

const viewer = vi.hoisted(() => ({ id: null as string | null }));
vi.mock("@/server/ai/groq", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/ai/groq")>()),
  groqJson: vi.fn(async () => ({
    data: { violation: false, category: "safe", reason: "ok" },
    usage: {},
    model: "m",
  })),
}));
vi.mock("@/server/env", () => ({ getServerEnv: () => ({ AI_GLOBAL_DAILY_TOKENS: 350_000 }) }));
vi.mock("@/server/rate-limit", () => ({ enforceLimit: vi.fn() }));
vi.mock("@/server/db/client", () => ({ getDatabase: () => db }));
vi.mock("@/server/ai/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/ai/storage")>()),
  getUpload: vi.fn(async () => Buffer.from("webp")),
}));
vi.mock("@/server/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/api")>()),
  getSessionContext: vi.fn(async () => {
    if (!viewer.id) throw new Error("guest");
    return { user: { id: viewer.id }, samplesSeeded: true, setCookies: [] };
  }),
}));

const url =
  process.env.TEST_DATABASE_URL ??
  "postgresql://siroquizz:siroquizz_local_only@localhost:5433/siroquizz_test";
if (!new URL(url).pathname.endsWith("_test")) throw new Error("Test DB required");
const connection = postgres(url, { max: 3 }),
  db = drizzle(connection, { schema }) as Database,
  cast = newCast();
const { an, mai, bao } = cast;

/** Calls the community router (which dispatches to the collaboration routes) like the API does. */
async function call(userId: string, method: string, path: string, body?: unknown) {
  const request = new Request(`http://test/api/v1/${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
  const result = await communityApi(db, userId, request, path.split("?")[0].split("/"));
  return result?.data as never;
}

beforeAll(() => migrate(db, { migrationsFolder: "drizzle" }));
beforeEach(async () => {
  await db.execute(sql`truncate "user" cascade`);
  await insertCast(db, cast);
  vi.mocked(enforceLimit).mockClear();
});
afterAll(() => connection.end());

it("serves the class library, collaborator and contribution routes", async () => {
  const klass = await makeClass(db, cast);
  const set = await makeSet(db, an);
  const folder = await createFolder(db, an, { name: "Unit 1" });
  await addSetToFolder(db, an, folder.id, set.id);
  const shared: { id: string } = await call(an, "PUT", `classes/${klass.id}/library`, {
    itemType: "set",
    itemId: set.id,
    audience: "class",
  });
  expect(((await call(bao, "GET", `classes/${klass.id}/library`)) as unknown[]).length).toBe(1);
  expect(((await call(mai, "GET", "me/class-library")) as unknown[]).length).toBe(1);
  expect(((await call(an, "GET", `sets/${set.id}/shares`)) as unknown[]).length).toBe(1);
  expect(((await call(an, "GET", `folders/${folder.id}/shares`)) as unknown[]).length).toBe(1);
  expect(await call(mai, "DELETE", `classes/${klass.id}/library/${shared.id}`)).toBeNull();

  expect(
    await call(an, "PUT", `sets/${set.id}/collaborators`, {
      principalType: "user",
      principalId: mai,
    }),
  ).toBeNull();
  const candidates: { classes: unknown[] } = await call(an, "GET", `sets/${set.id}/collaborators`);
  expect(candidates.classes).toHaveLength(1);
  expect(await call(an, "DELETE", `sets/${set.id}/collaborators/user/${mai}`)).toBeNull();
  const access: { acceptsContributions: boolean } = await call(
    an,
    "PATCH",
    `sets/${set.id}/contributions`,
    { accepts: false },
  );
  expect(access.acceptsContributions).toBe(false);
});

it("serves the change request routes and rate-limits proposals", async () => {
  const klass = await makeClass(db, cast);
  const set = await makeSet(db, an);
  await call(an, "PUT", `classes/${klass.id}/library`, { itemType: "set", itemId: set.id });
  const propose = (userId: string) =>
    call(userId, "POST", `sets/${set.id}/change-requests`, {
      baseUpdatedAt: set.updatedAt,
      ops: { cards: [{ op: "delete", cardId: set.cards[0].id }] },
    }) as Promise<{ id: string }>;
  const first = await propose(mai);
  expect(enforceLimit).toHaveBeenCalledWith(`change-request:${mai}`, 30, 3600);
  const second = await propose(bao);
  const third = await propose(mai);
  expect(((await call(an, "GET", `sets/${set.id}/change-requests`)) as unknown[]).length).toBe(3);
  expect(
    ((await call(mai, "GET", `sets/${set.id}/change-requests?status=all`)) as unknown[]).length,
  ).toBe(2);
  expect(await call(mai, "GET", `change-requests/${first.id}`)).toMatchObject({ id: first.id });
  expect(((await call(an, "GET", "me/change-requests?status=pending")) as unknown[]).length).toBe(
    3,
  );
  expect(
    ((await call(bao, "GET", "me/change-requests?status=pending&role=author")) as unknown[]).length,
  ).toBe(1);
  expect(await call(an, "POST", `change-requests/${first.id}/approve`, {})).toBeNull();
  expect(
    await call(an, "POST", `change-requests/${second.id}/reject`, { reviewNote: "No" }),
  ).toBeNull();
  expect(await call(mai, "POST", `change-requests/${third.id}/withdraw`)).toBeNull();
  await expect(call(an, "GET", "change-requests/x/y/z")).rejects.toMatchObject({ status: 404 });
  await expect(call(an, "PATCH", `sets/${set.id}/collaborators`)).rejects.toMatchObject({
    status: 404,
  });
});

it("A13: class viewers load images of a private set; guests and outsiders do not", async () => {
  const klass = await makeClass(db, cast);
  const set = await makeSet(db, an);
  await call(an, "PUT", `classes/${klass.id}/library`, { itemType: "set", itemId: set.id });
  const imageId = v7();
  await db.insert(schema.cardImages).values({
    id: imageId,
    cardId: set.cards[0].id,
    userId: an,
    key: `uploads/${imageId}`,
    alt: "",
    size: 4,
  });
  const load = (id: string | null) => {
    viewer.id = id;
    return getImage(new Request(`http://test/api/v1/images/${imageId}`), {
      params: Promise.resolve({ id: imageId }),
    });
  };
  expect((await load(bao)).status).toBe(200);
  expect((await load(an)).status).toBe(200);
  expect((await load(null)).status).toBe(404);
  expect((await load(cast.outsider)).status).toBe(404);
});
