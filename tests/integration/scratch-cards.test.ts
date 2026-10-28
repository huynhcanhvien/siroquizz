import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import { v7 } from "uuid";
import * as Y from "yjs";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/client";
import { createClass, getClass, joinClass } from "@/server/services/classes";
import { getSet } from "@/server/services/sets";
import { listClassLibrary } from "@/server/services/class-library";
import { writingApi } from "@/server/writing-api";
import { toBase64 } from "@/features/writing/lib/base64";
import { TEXT_NAME } from "@/server/lib/ydoc";

const limits = vi.hoisted(() => vi.fn());
vi.mock("@/server/rate-limit", () => ({ enforceLimit: limits }));
const url =
  process.env.TEST_DATABASE_URL ??
  "postgresql://siroquizz:siroquizz_local_only@localhost:5433/siroquizz_test";
if (!new URL(url).pathname.endsWith("_test")) throw new Error("Test DB required");
const connection = postgres(url, { max: 3 }),
  db = drizzle(connection, { schema }) as Database,
  teacher = v7(),
  student = v7();

/** Calls the writing router the way the API route does. */
async function call(
  userId: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const request = new Request(`http://test/api/v1/${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
  const result = await writingApi(db, userId, request, path.split("?")[0].split("/"));
  return result === null ? null : result.data;
}
async function classroom() {
  const { id } = await createClass(db, teacher, { name: "Lớp" });
  const { joinCode } = (await getClass(db, teacher, id)) as { joinCode: string };
  await joinClass(db, student, { code: joinCode });
  return id;
}
const save = (userId: string, term: string, definition = `${term} nghĩa`, extra = {}) =>
  call(userId, "POST", "me/scratch-cards", { term, definition, ...extra }) as Promise<{
    id: string;
    sourceDocId: string | null;
  }>;

beforeAll(() => migrate(db, { migrationsFolder: "drizzle" }));
beforeEach(async () => {
  await db.execute(sql`truncate "user" cascade`);
  await db.insert(schema.user).values([
    { id: teacher, name: "Cô", email: "s-teacher@example.com", emailVerified: true },
    { id: student, name: "Em", email: "s-student@example.com", emailVerified: true },
  ]);
  limits.mockReset();
});
afterAll(() => connection.end());

it("routes a whole writing session: create, open, write, roster, sync", async () => {
  const classId = await classroom();
  const session = (await call(teacher, "POST", `classes/${classId}/writing`, {
    title: "Bài 1",
    prompt: "Viết về mùa thu",
  })) as { id: string };
  await call(teacher, "PATCH", `writing/sessions/${session.id}`, { status: "open" });
  expect(await call(student, "GET", `classes/${classId}/writing`)).toHaveLength(1);
  const doc = (await call(student, "POST", `writing/sessions/${session.id}/docs`)) as {
    id: string;
  };
  const replica = new Y.Doc();
  replica.getText(TEXT_NAME).insert(0, "Mùa thu");
  const synced = (await call(student, "POST", `writing/docs/${doc.id}/sync`, {
    sv: toBase64(Y.encodeStateVector(new Y.Doc())),
    update: toBase64(Y.encodeStateAsUpdate(replica)),
  })) as { version: number };
  expect(synced.version).toBe(1);
  expect(limits).toHaveBeenCalledWith(`sync:${student}`, 120, 60);
  expect(await call(teacher, "GET", `writing/docs/${doc.id}`)).toMatchObject({ version: 1 });
  const overview = (await call(teacher, "GET", `writing/sessions/${session.id}/overview`)) as {
    docs: { textPreview: string }[];
  };
  expect(overview.docs[0].textPreview).toBe("Mùa thu");
  expect(limits).toHaveBeenCalledWith(`overview:${teacher}`, 60, 60);
  expect(await call(student, "GET", `writing/sessions/${session.id}`)).toMatchObject({
    prompt: "Viết về mùa thu",
    myDocId: doc.id,
  });
  await call(teacher, "DELETE", `writing/sessions/${session.id}`);
  expect(await call(teacher, "GET", `classes/${classId}/writing`)).toEqual([]);
  expect(await call(teacher, "GET", "writing/unknown/x")).toBeNull();
  expect(await call(teacher, "GET", "me/other")).toBeNull();
});

it("keeps scratch cards per person, edits them and links readable source documents", async () => {
  const classId = await classroom();
  const session = (await call(teacher, "POST", `classes/${classId}/writing`, { title: "B" })) as {
    id: string;
  };
  await call(teacher, "PATCH", `writing/sessions/${session.id}`, { status: "open" });
  const doc = (await call(student, "POST", `writing/sessions/${session.id}/docs`)) as {
    id: string;
  };
  const linked = await save(student, "lá vàng", "yellow leaf", { sourceDocId: doc.id });
  expect(linked.sourceDocId).toBe(doc.id);
  // The teacher's own document is hidden from this student: the card is saved without a link.
  const teacherDoc = (await call(teacher, "POST", `writing/sessions/${session.id}/docs`)) as {
    id: string;
  };
  expect((await save(student, "gió", "wind", { sourceDocId: teacherDoc.id })).sourceDocId).toBe(
    null,
  );
  expect(limits).toHaveBeenCalledWith(`scratch:${student}`, 120, 60);
  expect(await call(teacher, "GET", "me/scratch-cards")).toEqual([]);
  const edited = (await call(student, "PATCH", `me/scratch-cards/${linked.id}`, {
    definition: "lá cây màu vàng",
    phonetic: "",
  })) as { definition: string; phonetic: string | null };
  expect(edited).toMatchObject({ definition: "lá cây màu vàng", phonetic: null });
  await expect(
    call(teacher, "PATCH", `me/scratch-cards/${linked.id}`, { term: "x" }),
  ).rejects.toMatchObject({ status: 404 });
  await call(student, "DELETE", `me/scratch-cards/${linked.id}`);
  await expect(call(student, "DELETE", `me/scratch-cards/${linked.id}`)).rejects.toMatchObject({
    status: 404,
  });
  expect(await call(student, "GET", "me/scratch-cards")).toHaveLength(1);
  await call(student, "DELETE", "me/scratch-cards");
  expect(await call(student, "GET", "me/scratch-cards")).toEqual([]);
});

it("stops at 300 scratch cards", async () => {
  await db
    .insert(schema.scratchCards)
    .values(Array.from({ length: 300 }, (_, i) => ({ id: v7(), userId: student, term: `t${i}` })));
  await expect(save(student, "one more")).rejects.toMatchObject({
    status: 409,
    code: "SCRATCH_LIMIT",
  });
});

it("turns scratch cards into a set, refusing incomplete ones, and shares it with a class", async () => {
  const classId = await classroom();
  const a = await save(student, "apple"),
    b = await save(student, "banana"),
    blank = await save(student, "cherry", "");
  const input = { title: "Fruit", termLang: "en", definitionLang: "vi" };
  await expect(
    call(student, "POST", "me/scratch-cards/materialize", { ...input, ids: [a.id, blank.id] }),
  ).rejects.toMatchObject({ status: 400, code: "SCRATCH_INCOMPLETE" });
  await expect(
    call(student, "POST", "me/scratch-cards/materialize", { ...input, ids: [a.id, v7()] }),
  ).rejects.toMatchObject({ status: 404 });
  // Any member can share their own new set with the class; teachers-only hides it from peers.
  const { setId } = (await call(student, "POST", "me/scratch-cards/materialize", {
    ...input,
    ids: [b.id, a.id],
    classId,
    audience: "teachers",
  })) as { setId: string };
  const set = await getSet(db, student, setId);
  expect(set.cards.map((card) => card.term)).toEqual(["banana", "apple"]);
  const library = await listClassLibrary(db, teacher, classId);
  expect(library).toEqual([expect.objectContaining({ itemId: setId, audience: "teachers" })]);
  const left = (await call(student, "GET", "me/scratch-cards")) as { id: string }[];
  expect(left.map((card) => card.id)).toEqual([blank.id]);
});

it("rolls back the new set when sharing to a class is refused", async () => {
  await classroom();
  const { id: otherClass } = await createClass(db, teacher, { name: "Lớp khác" });
  const a = await save(student, "one"),
    b = await save(student, "two");
  await expect(
    call(student, "POST", "me/scratch-cards/materialize", {
      title: "Mine",
      termLang: "en",
      definitionLang: "vi",
      ids: [a.id, b.id],
      classId: otherClass,
    }),
  ).rejects.toMatchObject({ status: 404 });
  // The whole transaction rolled back: the cards are still there and no set was made.
  expect(await call(student, "GET", "me/scratch-cards")).toHaveLength(2);
  expect(await db.select().from(schema.studySets)).toEqual([]);
});
