import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import { v7 } from "uuid";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/client";
import { communityApi } from "@/server/community-api";
import { createSetInTransaction } from "@/server/services/sets";

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

const url =
  process.env.TEST_DATABASE_URL ??
  "postgresql://siroquizz:siroquizz_local_only@localhost:5433/siroquizz_test";
if (!new URL(url).pathname.endsWith("_test")) throw new Error("Test DB required");
const connection = postgres(url, { max: 3 }),
  db = drizzle(connection, { schema }) as Database,
  owner = v7(),
  reader = v7(),
  admin = v7();

/** Calls the community router the way the API route does. */
async function call(userId: string, method: string, path: string, body?: unknown) {
  const request = new Request(`http://test/api/v1/${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
  const result = await communityApi(db, userId, request, path.split("/"));
  return result?.data;
}
const makeSet = () =>
  db.transaction((tx) =>
    createSetInTransaction(tx, owner, {
      title: "Route words",
      description: "",
      termLang: "en",
      definitionLang: "vi",
      source: "manual",
      cards: Array.from({ length: 10 }, (_, i) => ({ term: `w${i}`, definition: `d${i}` })),
    }),
  );

beforeAll(() => migrate(db, { migrationsFolder: "drizzle" }));
beforeEach(async () => {
  await db.execute(sql`truncate "user" cascade`);
  await db.insert(schema.user).values([
    {
      id: owner,
      name: "Owner",
      email: "r-owner@example.com",
      emailVerified: true,
      createdAt: new Date(Date.now() - 2 * 86400_000),
    },
    {
      id: reader,
      name: "Reader",
      email: "r-reader@example.com",
      emailVerified: true,
      createdAt: new Date(Date.now() - 2 * 86400_000),
    },
    {
      id: admin,
      name: "Admin",
      email: "r-admin@example.com",
      emailVerified: true,
      createdAt: new Date(Date.now() - 2 * 86400_000),
      role: "admin",
    },
  ]);
});
afterAll(() => connection.end());

it("routes sharing, copying, tags, moderation, reports and admin actions", async () => {
  const set = await makeSet();
  const shared = (await call(owner, "PATCH", `sets/${set.id}/visibility`, {
    visibility: "public",
  })) as { slug: string; moderationStatus: string };
  expect(shared.moderationStatus).toBe("approved");
  expect(await call(owner, "PATCH", `sets/${set.id}/tags`, { tags: ["food"] })).toMatchObject({
    tags: ["food"],
  });
  expect(await call(owner, "POST", `sets/${set.id}/moderation`, {})).toMatchObject({
    moderationStatus: "approved",
  });
  expect(await call(reader, "GET", `public/${shared.slug}`)).toMatchObject({
    title: "Route words",
  });
  const copy = (await call(reader, "POST", `public/${shared.slug}/copy`, {})) as { id: string };
  expect(copy.id).toMatch(/[0-9a-f-]{36}/);
  expect(
    await call(reader, "POST", "reports", { targetType: "set", targetId: set.id, reason: "spam" }),
  ).toBeNull();

  const [report] = (await call(admin, "GET", "admin/reports")) as { id: string }[];
  expect(await call(admin, "GET", "admin/moderation")).toEqual([]);
  expect(
    await call(admin, "POST", `admin/reports/${report.id}/resolve`, { action: "dismiss" }),
  ).toBeNull();
  for (const action of ["hide", "restore", "reject", "approve"])
    expect(await call(admin, "POST", `admin/sets/${set.id}/${action}`, {})).toBeNull();
  expect(await call(admin, "POST", `admin/users/${reader}/ban`, {})).toBeNull();
  expect(await call(admin, "POST", `admin/users/${reader}/unban`, {})).toBeNull();
  await expect(call(admin, "POST", `admin/users/${reader}/mute`, {})).rejects.toMatchObject({
    status: 404,
  });
  await expect(call(admin, "GET", "admin/unknown")).rejects.toMatchObject({ status: 404 });
  await expect(call(reader, "GET", "admin/reports")).rejects.toMatchObject({ status: 403 });
});

it("routes profile settings and leaves other paths to the main router", async () => {
  expect(await call(owner, "PATCH", "me/profile", { username: "route_owner" })).toMatchObject({
    username: "route_owner",
  });
  expect(await call(owner, "GET", "me/profile")).toMatchObject({ profilePublic: true });
  expect(await communityApi(db, owner, new Request("http://test/x"), ["sets"])).toBeNull();
  expect(await communityApi(db, owner, new Request("http://test/x"), ["activity"])).toBeNull();
});

it("routes folders end to end", async () => {
  const set = await makeSet();
  const folder = (await call(owner, "POST", "folders", { name: "Routes" })) as { id: string };
  expect(await call(owner, "GET", "folders")).toHaveLength(1);
  expect(await call(owner, "PATCH", `folders/${folder.id}`, { name: "Renamed" })).toBeNull();
  expect(await call(owner, "PUT", `folders/${folder.id}/sets/${set.id}`)).toBeNull();
  expect(await call(owner, "GET", `sets/${set.id}/folders`)).toEqual([folder.id]);
  expect(await call(owner, "GET", `folders/${folder.id}`)).toMatchObject({ name: "Renamed" });
  expect(await call(owner, "GET", `folders/${folder.id}/study`)).toMatchObject({
    title: "Renamed",
  });
  await expect(
    call(owner, "PATCH", `folders/${folder.id}/sets/${set.id}`, {}),
  ).rejects.toMatchObject({
    status: 405,
  });
  expect(await call(owner, "DELETE", `folders/${folder.id}/sets/${set.id}`)).toBeNull();
  expect(await call(owner, "DELETE", `folders/${folder.id}`)).toBeNull();
  await expect(call(owner, "GET", `folders/${folder.id}/nope`)).rejects.toMatchObject({
    status: 404,
  });
});

it("routes classes end to end", async () => {
  const set = await makeSet();
  const klass = (await call(owner, "POST", "classes", { name: "Route class" })) as { id: string };
  const detail = (await call(owner, "GET", `classes/${klass.id}`)) as { joinCode: string };
  expect(await call(reader, "POST", "classes/join", { code: detail.joinCode })).toEqual(klass);
  expect(await call(owner, "GET", "classes")).toHaveLength(1);
  expect(await call(owner, "PATCH", `classes/${klass.id}`, { joinLocked: true })).toBeNull();
  expect(await call(owner, "POST", `classes/${klass.id}/code`, {})).toHaveProperty("joinCode");
  expect(
    await call(owner, "PUT", `classes/${klass.id}/sets/${set.id}`, { dueAt: null }),
  ).toBeNull();
  expect(await call(reader, "GET", "classes/assigned")).toHaveLength(1);
  expect(await call(owner, "GET", `classes/${klass.id}/progress`)).toMatchObject({
    sets: [expect.any(Object)],
  });
  expect(
    await call(owner, "PATCH", `classes/${klass.id}/members/${reader}`, { role: "teacher" }),
  ).toBeNull();
  expect(
    await call(owner, "PATCH", `classes/${klass.id}/members/${reader}`, { role: "student" }),
  ).toBeNull();
  expect(await call(owner, "DELETE", `classes/${klass.id}/sets/${set.id}`)).toBeNull();
  expect(await call(reader, "POST", `classes/${klass.id}/leave`, {})).toBeNull();
  await expect(
    call(owner, "DELETE", `classes/${klass.id}/members/${reader}`),
  ).rejects.toMatchObject({
    status: 404,
  });
  expect(await call(owner, "DELETE", `classes/${klass.id}`)).toBeNull();
  await expect(call(owner, "GET", "classes/x/y/z/w")).rejects.toMatchObject({ status: 404 });
});
