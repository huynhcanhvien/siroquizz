import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq, sql } from "drizzle-orm";
import { v7 } from "uuid";
import * as Y from "yjs";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/client";
import { createClass, getClass, joinClass } from "@/server/services/classes";
import {
  createSession,
  deleteSession,
  getSession,
  listSessions,
  purgeClosedSessions,
  sessionOverview,
  updateSession,
} from "@/server/services/writing";
import { getDocState, openOwnDoc, syncDoc } from "@/server/services/writing-docs";
import { fromBase64, toBase64 } from "@/features/writing/lib/base64";
import { TEXT_NAME } from "@/server/lib/ydoc";
import type { SessionPatch } from "@/features/writing/schemas";

vi.mock("@/server/rate-limit", () => ({ enforceLimit: vi.fn() }));
const url =
  process.env.TEST_DATABASE_URL ??
  "postgresql://siroquizz:siroquizz_local_only@localhost:5433/siroquizz_test";
if (!new URL(url).pathname.endsWith("_test")) throw new Error("Test DB required");
const queries: string[] = [];
const connection = postgres(url, { max: 3 }),
  db = drizzle(connection, {
    schema,
    logger: { logQuery: (query) => void queries.push(query) },
  }) as Database,
  teacher = v7(),
  author = v7(),
  peer = v7(),
  outsider = v7();

async function classroom() {
  const { id } = await createClass(db, teacher, { name: "Lớp viết" });
  const { joinCode } = (await getClass(db, teacher, id)) as { joinCode: string };
  await joinClass(db, author, { code: joinCode });
  await joinClass(db, peer, { code: joinCode });
  return id;
}
async function sessionWith(patch: SessionPatch = { status: "open" }) {
  const classId = await classroom();
  const session = await createSession(db, teacher, classId, { title: "Mùa thu", prompt: "Tả" });
  await updateSession(db, teacher, session.id, patch);
  return { classId, sessionId: session.id };
}
/** A client replica of a document, typing and syncing like the browser does. */
class Client {
  doc = new Y.Doc();
  version = 0;
  pending: Uint8Array | null = null;
  constructor(
    readonly userId: string,
    readonly docId: string,
  ) {
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin !== "remote")
        this.pending = this.pending ? Y.mergeUpdates([this.pending, update]) : update;
    });
  }
  type(index: number, text: string) {
    this.doc.getText(TEXT_NAME).insert(index, text);
  }
  text = () => this.doc.getText(TEXT_NAME).toString();
  async sync() {
    const response = await syncDoc(db, this.userId, this.docId, {
      sv: toBase64(Y.encodeStateVector(this.doc)),
      version: this.version,
      ...(this.pending ? { update: toBase64(this.pending) } : {}),
    });
    this.pending = null;
    this.version = response.version;
    if (response.update) Y.applyUpdate(this.doc, fromBase64(response.update), "remote");
    return response;
  }
}

beforeAll(() => migrate(db, { migrationsFolder: "drizzle" }));
beforeEach(async () => {
  await db.execute(sql`truncate "user" cascade`);
  await db.insert(schema.user).values([
    { id: teacher, name: "Cô Lan", email: "w-teacher@example.com", emailVerified: true },
    { id: author, name: "An", email: "w-author@example.com", emailVerified: true },
    { id: peer, name: "Bình", email: "w-peer@example.com", emailVerified: true },
    { id: outsider, name: "Lạ", email: "w-out@example.com", emailVerified: true },
  ]);
});
afterAll(() => connection.end());

describe("sessions", () => {
  it("hides drafts from students and lists documents only to those allowed", async () => {
    const classId = await classroom();
    const draft = await createSession(db, teacher, classId, { title: "Nháp" });
    expect(await listSessions(db, author, classId)).toEqual([]);
    expect(await listSessions(db, teacher, classId)).toHaveLength(1);
    await expect(getSession(db, author, draft.id)).rejects.toMatchObject({ status: 404 });
    await expect(getSession(db, outsider, draft.id)).rejects.toMatchObject({ status: 404 });
    await expect(createSession(db, author, classId, { title: "x" })).rejects.toMatchObject({
      status: 403,
    });
    const open = await updateSession(db, teacher, draft.id, { status: "open" });
    expect(open.openedAt).not.toBeNull();
    const myDoc = await openOwnDoc(db, author, draft.id);
    const [listed] = await listSessions(db, author, classId);
    expect(listed).toMatchObject({ status: "open", myDocId: myDoc.id, docCount: 1 });
    const studentView = await getSession(db, author, draft.id);
    // Everyone in the class is listed so each person's text gets the right colour.
    expect(studentView.members.map((m) => m.userId).sort()).toEqual([teacher, author, peer].sort());
    expect(studentView.docs).toBeNull();
    expect((await getSession(db, teacher, draft.id)).docs).toHaveLength(1);
    await updateSession(db, teacher, draft.id, { peerVisibility: "open" });
    expect((await getSession(db, peer, draft.id)).docs).toHaveLength(1);
  });

  it("turns peer editing off whenever documents are hidden from peers", async () => {
    const { sessionId } = await sessionWith({
      status: "open",
      peerVisibility: "open",
      peerEditing: true,
    });
    const hidden = await updateSession(db, teacher, sessionId, { peerVisibility: "hidden" });
    expect(hidden.peerEditing).toBe(false);
    const closed = await updateSession(db, teacher, sessionId, { status: "closed" });
    expect(closed.closedAt).not.toBeNull();
    await expect(updateSession(db, author, sessionId, { status: "open" })).rejects.toMatchObject({
      status: 403,
    });
  });

  it("caps sessions per class", async () => {
    const classId = await classroom();
    await db
      .insert(schema.writingSessions)
      .values(Array.from({ length: 100 }, (_, i) => ({ id: v7(), classId, title: `S${i}` })));
    await expect(createSession(db, teacher, classId, { title: "101" })).rejects.toMatchObject({
      status: 409,
    });
  });

  it("deletes a session with its documents, by a teacher only", async () => {
    const { sessionId } = await sessionWith();
    await openOwnDoc(db, author, sessionId);
    await expect(deleteSession(db, author, sessionId)).rejects.toMatchObject({ status: 403 });
    await deleteSession(db, teacher, sessionId);
    expect(await db.select().from(schema.writingDocs)).toHaveLength(0);
  });

  it("purges only sessions closed more than 180 days ago", async () => {
    const { sessionId } = await sessionWith({ status: "closed" });
    const recent = await sessionWith({ status: "closed" });
    const open = await sessionWith({ status: "open" });
    await db
      .update(schema.writingSessions)
      .set({ closedAt: new Date(Date.now() - 181 * 86400_000) })
      .where(eq(schema.writingSessions.id, sessionId));
    expect(await purgeClosedSessions(db)).toBe(1);
    const left = (await db.select().from(schema.writingSessions)).map((s) => s.id).sort();
    expect(left).toEqual([recent.sessionId, open.sessionId].sort());
  });
});

describe("document access", () => {
  type Case = [string, SessionPatch, string, "read" | "write", number | string | "ok"];
  const cases: Case[] = [
    ["teacher reads a draft", { status: "draft" }, teacher, "read", "ok"],
    ["author cannot read a draft", { status: "draft" }, author, "read", 404],
    ["author writes an open session", { status: "open" }, author, "write", "ok"],
    ["peer cannot read hidden docs", { status: "open" }, peer, "read", 404],
    ["peer reads open docs", { status: "open", peerVisibility: "open" }, peer, "read", "ok"],
    [
      "peer cannot write without editing",
      { status: "open", peerVisibility: "open" },
      peer,
      "write",
      "FORBIDDEN",
    ],
    [
      "peer writes with editing",
      { status: "open", peerVisibility: "open", peerEditing: true },
      peer,
      "write",
      "ok",
    ],
    ["author reads a closed session", { status: "closed" }, author, "read", "ok"],
    ["nobody writes a closed session", { status: "closed" }, teacher, "write", "SESSION_CLOSED"],
    ["outsider sees nothing", { status: "open", peerVisibility: "open" }, outsider, "read", 404],
  ];
  it.each(cases)("%s", async (_name, patch, viewer, mode, outcome) => {
    const { sessionId } = await sessionWith({ status: "open" });
    const { id: docId } = await openOwnDoc(db, author, sessionId);
    await updateSession(db, teacher, sessionId, { ...patch });
    const client = new Client(viewer, docId);
    if (mode === "write") client.type(0, "x");
    const attempt = mode === "read" ? getDocState(db, viewer, docId) : client.sync();
    if (outcome === "ok") await expect(attempt).resolves.toBeTruthy();
    else if (typeof outcome === "number")
      await expect(attempt).rejects.toMatchObject({ status: outcome });
    else await expect(attempt).rejects.toMatchObject({ status: 403, code: outcome });
  });

  it("keeps a teacher's own document closed to student edits even with peer editing on", async () => {
    const { sessionId } = await sessionWith({
      status: "open",
      peerVisibility: "open",
      peerEditing: true,
    });
    const { id: teacherDoc } = await openOwnDoc(db, teacher, sessionId);
    const { id: studentDoc } = await openOwnDoc(db, author, sessionId);
    const intruder = new Client(peer, teacherDoc);
    intruder.type(0, "x");
    await expect(intruder.sync()).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(await getDocState(db, peer, teacherDoc)).toMatchObject({ readOnly: true });
    const helper = new Client(peer, studentDoc);
    helper.type(0, "y");
    await expect(helper.sync()).resolves.toMatchObject({ version: 1, readOnly: false });
  });

  it("lets students start a document only while the session is open", async () => {
    const { sessionId } = await sessionWith({ status: "closed" });
    await expect(openOwnDoc(db, author, sessionId)).rejects.toMatchObject({
      code: "SESSION_CLOSED",
    });
    const again = await openOwnDoc(db, teacher, sessionId);
    expect(await openOwnDoc(db, teacher, sessionId)).toEqual(again);
  });
});

describe("sync", () => {
  it("refuses an edit that raced the session closing, re-checked under the row lock", async () => {
    const { sessionId } = await sessionWith();
    const { id: docId } = await openOwnDoc(db, author, sessionId);
    const writer = new Client(author, docId);
    writer.type(0, "kịp không?");
    let finishClose: () => void = () => undefined;
    let closeStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => (closeStarted = resolve));
    // The teacher's close holds the session row until we let it commit.
    const closing = db.transaction(async (tx) => {
      await tx
        .update(schema.writingSessions)
        .set({ status: "closed", closedAt: new Date() })
        .where(eq(schema.writingSessions.id, sessionId));
      closeStarted();
      await new Promise<void>((resolve) => (finishClose = resolve));
    });
    await started;
    // The access check still sees the committed (open) session; the merge must wait and re-check.
    const sync = writer.sync();
    await new Promise((resolve) => setTimeout(resolve, 200));
    finishClose();
    await closing;
    await expect(sync).rejects.toMatchObject({ status: 403, code: "SESSION_CLOSED" });
    const [row] = await db.select().from(schema.writingDocs);
    expect(row.version).toBe(0);
  });

  it("merges concurrent edits from two replicas and converges", async () => {
    const { sessionId } = await sessionWith({
      status: "open",
      peerVisibility: "open",
      peerEditing: true,
    });
    const { id: docId } = await openOwnDoc(db, author, sessionId);
    const a = new Client(author, docId),
      b = new Client(peer, docId);
    a.type(0, "Hello");
    b.type(0, "World");
    expect((await a.sync()).version).toBe(1);
    const fromB = await b.sync();
    expect(fromB.version).toBe(2);
    await a.sync();
    expect(a.text()).toBe(b.text());
    expect(a.text()).toHaveLength(10);
    const state = await getDocState(db, teacher, docId);
    expect(state).toMatchObject({ version: 2, readOnly: false });
    const [row] = await db.select().from(schema.writingDocs);
    expect(row).toMatchObject({ charCount: 10, lastEditorId: peer });
    expect(row.textPreview).toBe(a.text());
  });

  it("answers a poll with a current version from one select, without the state", async () => {
    const { sessionId } = await sessionWith();
    const { id: docId } = await openOwnDoc(db, author, sessionId);
    const a = new Client(author, docId);
    a.type(0, "Xin chào");
    await a.sync();
    queries.length = 0;
    const idle = await a.sync();
    expect(idle).toEqual({
      version: 1,
      readOnly: false,
      session: { status: "open", peerVisibility: "hidden", peerEditing: false },
    });
    expect(queries).toHaveLength(1);
    expect(queries[0]).not.toContain('"state"');
  });

  it("refuses oversized updates and states, and malformed updates", async () => {
    const { sessionId } = await sessionWith();
    const { id: docId } = await openOwnDoc(db, author, sessionId);
    const sv = toBase64(Y.encodeStateVector(new Y.Doc()));
    const huge = toBase64(new Uint8Array(65 * 1024));
    await expect(syncDoc(db, author, docId, { sv, update: huge })).rejects.toMatchObject({
      status: 413,
      code: "DOC_TOO_LARGE",
    });
    await expect(
      syncDoc(db, author, docId, { sv, update: toBase64(new Uint8Array([255, 1, 2])) }),
    ).rejects.toMatchObject({ status: 400 });
    // Many small updates that together pass the state limit: the last one is refused.
    const writer = new Client(author, docId);
    const chunk = "abcdefghij".repeat(6000);
    let refused: unknown = null;
    for (let i = 0; i < 12 && !refused; i++) {
      writer.type(writer.text().length, chunk);
      refused = await writer.sync().then(
        () => null,
        (error: unknown) => error,
      );
    }
    expect(refused).toMatchObject({ status: 413, code: "DOC_TOO_LARGE" });
    const [row] = await db.select().from(schema.writingDocs);
    expect(row.state!.length).toBeLessThanOrEqual(512 * 1024);
  });

  it("feeds the roster only documents changed since the last poll", async () => {
    const { sessionId } = await sessionWith();
    const { id: docId } = await openOwnDoc(db, author, sessionId);
    const first = await sessionOverview(db, teacher, sessionId, new URLSearchParams());
    expect(first.docs).toHaveLength(1);
    const since = new URLSearchParams({ since: first.serverTime });
    // Documents untouched for longer than the overlap window are not sent again.
    await db.update(schema.writingDocs).set({ updatedAt: new Date(Date.now() - 60_000) });
    expect((await sessionOverview(db, teacher, sessionId, since)).docs).toEqual([]);
    const a = new Client(author, docId);
    a.type(0, "Mới");
    await a.sync();
    const changed = await sessionOverview(db, teacher, sessionId, since);
    expect(changed.docs).toEqual([expect.objectContaining({ id: docId, textPreview: "Mới" })]);
    expect((await sessionOverview(db, author, sessionId, new URLSearchParams())).docs).toEqual([]);
  });
});
