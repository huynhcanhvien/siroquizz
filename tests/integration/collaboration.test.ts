import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq, sql } from "drizzle-orm";
import { v7 } from "uuid";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/client";
import { getSet, updateSet } from "@/server/services/sets";
import { setAcceptsContributions, setVisibility } from "@/server/services/sharing";
import { shareToClass } from "@/server/services/class-library";
import {
  collaboratorCandidates,
  grantCollaborator,
  MAX_COLLABORATORS_PER_SET,
} from "@/server/services/collaborators";
import {
  getChangeRequest,
  listChangeRequests,
  myChangeRequests,
  proposeChange,
  reviewChangeRequest,
  withdrawChangeRequest,
} from "@/server/services/change-requests";
import { leaveClass } from "@/server/services/classes";
import { dueCards } from "@/server/services/learning";
import { insertCast, makeClass, makeSet, newCast } from "./helpers/collab";

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
  cast = newCast();
const { an, mai, binh, bao, outsider } = cast;

beforeAll(() => migrate(db, { migrationsFolder: "drizzle" }));
beforeEach(async () => {
  await db.execute(sql`truncate "user" cascade`);
  await insertCast(db, cast);
});
afterAll(() => connection.end());

async function sharedSet(size = 4) {
  const klass = await makeClass(db, cast);
  const set = await makeSet(db, an, "An's words", size);
  await shareToClass(db, an, klass.id, { itemType: "set", itemId: set.id });
  return { klass, set };
}
const editCard = (cardId: string, definition: string) => ({
  op: "edit" as const,
  cardId,
  card: { term: "edited", definition },
});

describe("collaborators", () => {
  it("C1: grants need a shared class, no self-grant and at most 50", async () => {
    const { set } = await sharedSet();
    await expect(
      grantCollaborator(db, an, set.id, { principalType: "user", principalId: outsider }),
    ).rejects.toMatchObject({ status: 403, code: "NOT_CLASSMATE" });
    await expect(
      grantCollaborator(db, an, set.id, { principalType: "user", principalId: an }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      grantCollaborator(db, an, set.id, { principalType: "class_teachers", principalId: v7() }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      grantCollaborator(db, bao, set.id, { principalType: "user", principalId: mai }),
    ).rejects.toMatchObject({ status: 404 });
    await db.insert(schema.setCollaborators).values(
      Array.from({ length: MAX_COLLABORATORS_PER_SET }, () => ({
        setId: set.id,
        principalType: "user" as const,
        principalId: v7(),
        grantedBy: an,
      })),
    );
    await expect(
      grantCollaborator(db, an, set.id, { principalType: "user", principalId: mai }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("C2: a student owner is offered only the teachers; a teacher owner everyone", async () => {
    const { klass, set } = await sharedSet();
    await grantCollaborator(db, an, set.id, { principalType: "user", principalId: mai });
    const forStudent = await collaboratorCandidates(db, an, set.id);
    expect(forStudent.classes).toEqual([
      expect.objectContaining({ classId: klass.id, myRole: "student", teachersGranted: false }),
    ]);
    expect(
      forStudent.classes[0].members.map((member) => [member.name, member.granted]).toSorted(),
    ).toEqual([
      ["Cô Mai", true],
      ["Thầy Bình", false],
    ]);
    const teacherSet = await makeSet(db, mai, "Mai's words");
    await grantCollaborator(db, mai, teacherSet.id, {
      principalType: "class_teachers",
      principalId: klass.id,
    });
    const forTeacher = await collaboratorCandidates(db, mai, teacherSet.id);
    expect(forTeacher.classes[0].teachersGranted).toBe(true);
    expect(forTeacher.classes[0].members.map((member) => member.name).toSorted()).toEqual([
      "An",
      "Bảo",
      "Thầy Bình",
    ]);
  });
});

describe("change requests", () => {
  it("R1: who may propose and what a proposal may hold", async () => {
    const { klass, set } = await sharedSet();
    const base = { baseUpdatedAt: set.updatedAt, ops: { cards: [editCard(set.cards[0].id, "x")] } };
    await expect(proposeChange(db, an, set.id, base)).rejects.toMatchObject({ status: 403 });
    await expect(proposeChange(db, outsider, set.id, base)).rejects.toMatchObject({ status: 404 });
    // A shared link lets an outsider study the set, not propose edits: proposals stay in class.
    await setVisibility(db, an, set.id, { visibility: "unlisted" });
    await expect(proposeChange(db, outsider, set.id, base)).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
    await setVisibility(db, an, set.id, { visibility: "private" });
    await expect(
      proposeChange(db, mai, set.id, {
        ...base,
        ops: { cards: [editCard(v7(), "unknown card")] },
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(proposeChange(db, mai, set.id, { ...base, classId: v7() })).rejects.toMatchObject({
      status: 404,
    });
    const { id } = await proposeChange(db, mai, set.id, {
      ...base,
      classId: klass.id,
      note: "Typo",
    });
    expect(id).toBeTruthy();
    await setAcceptsContributions(db, an, set.id, { accepts: false });
    await expect(proposeChange(db, bao, set.id, base)).rejects.toMatchObject({
      status: 403,
      code: "CONTRIBUTIONS_CLOSED",
    });
    await setAcceptsContributions(db, an, set.id, { accepts: true });
    await db.insert(schema.setChangeRequests).values(
      Array.from({ length: 19 }, () => ({
        id: v7(),
        setId: set.id,
        authorId: bao,
        ops: { cards: [] },
        baseUpdatedAt: new Date(),
      })),
    );
    await expect(proposeChange(db, bao, set.id, base)).rejects.toMatchObject({
      status: 409,
      code: "CHANGE_REQUEST_LIMIT",
    });
  });

  it("R2: approval applies additions, edits and deletions atomically and is audited", async () => {
    const { set } = await sharedSet();
    await setVisibility(db, an, set.id, { visibility: "public" });
    const before = await getSet(db, an, set.id);
    const { id } = await proposeChange(db, mai, set.id, {
      baseUpdatedAt: before.updatedAt,
      ops: {
        title: "Better title",
        cards: [
          editCard(set.cards[1].id, "fixed"),
          { op: "delete", cardId: set.cards[0].id },
          { op: "add", card: { term: "new", definition: "mới" } },
        ],
      },
    });
    expect((await getSet(db, an, set.id)).access?.pendingChangeRequests).toBe(1);
    await reviewChangeRequest(db, an, id, "approve", { reviewNote: "Thanks" });
    const after = await getSet(db, an, set.id);
    expect(after.title).toBe("Better title");
    expect(after.cards.map((card) => card.term)).toEqual([
      "edited",
      set.cards[2].term,
      set.cards[3].term,
      "new",
    ]);
    expect(after.cards[0].id).toBe(set.cards[1].id);
    expect(after.cardCount).toBe(4);
    expect(Date.parse(after.updatedAt)).toBeGreaterThan(Date.parse(before.updatedAt));
    const [row] = await db.select().from(schema.studySets).where(eq(schema.studySets.id, set.id));
    expect(row.moderationStatus).toBe("approved");
    const positions = await db
      .select({ position: schema.cards.position })
      .from(schema.cards)
      .where(eq(schema.cards.setId, set.id))
      .orderBy(schema.cards.position);
    expect(positions.map((p) => p.position)).toEqual([0, 1, 2, 3]);
    const audit = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.action, "change_request.approve"));
    expect(audit).toEqual([
      expect.objectContaining({ actorId: an, meta: { requestId: id, authorId: mai } }),
    ]);
    expect(await getChangeRequest(db, mai, id)).toMatchObject({
      status: "approved",
      reviewNote: "Thanks",
    });
  });

  it("R3: an approval leaving fewer than 2 cards fails and changes nothing", async () => {
    const { set } = await sharedSet(2);
    const { id } = await proposeChange(db, mai, set.id, {
      baseUpdatedAt: set.updatedAt,
      ops: { cards: [{ op: "delete", cardId: set.cards[0].id }] },
    });
    await expect(reviewChangeRequest(db, an, id, "approve", {})).rejects.toMatchObject({
      status: 400,
    });
    expect((await getChangeRequest(db, an, id)).status).toBe("pending");
    expect((await getSet(db, an, set.id)).cards).toHaveLength(2);
  });

  it("R4: ops on cards deleted since are skipped and the request reports it is stale", async () => {
    const { set } = await sharedSet();
    const { id } = await proposeChange(db, bao, set.id, {
      baseUpdatedAt: set.updatedAt,
      ops: { cards: [editCard(set.cards[0].id, "late"), editCard(set.cards[1].id, "kept")] },
    });
    await updateSet(db, an, set.id, { ...set, cards: set.cards.slice(1) });
    const detail = await getChangeRequest(db, an, id);
    expect(detail.stale).toBe(true);
    expect(detail.cards[0]).toMatchObject({ op: "edit", before: null });
    expect(detail.cards[1]).toMatchObject({ op: "edit", before: { term: set.cards[1].term } });
    await reviewChangeRequest(db, an, id, "approve", {});
    const after = await getSet(db, an, set.id);
    expect(after.cards.map((card) => card.definition)).toEqual(["kept", "d 2", "d 3"]);
  });

  it("R5: rejection, double review, withdrawal and listings", async () => {
    const { set } = await sharedSet();
    const ops = { cards: [editCard(set.cards[0].id, "x")] };
    const first = await proposeChange(db, bao, set.id, { baseUpdatedAt: set.updatedAt, ops });
    const second = await proposeChange(db, mai, set.id, { baseUpdatedAt: set.updatedAt, ops });
    await expect(reviewChangeRequest(db, bao, first.id, "reject", {})).rejects.toMatchObject({
      status: 404,
    });
    await reviewChangeRequest(db, an, first.id, "reject", { reviewNote: "Not needed" });
    expect(await getChangeRequest(db, bao, first.id)).toMatchObject({
      status: "rejected",
      reviewNote: "Not needed",
    });
    await expect(reviewChangeRequest(db, an, first.id, "approve", {})).rejects.toMatchObject({
      status: 409,
    });
    await expect(withdrawChangeRequest(db, bao, second.id)).rejects.toMatchObject({ status: 403 });
    await expect(getChangeRequest(db, binh, second.id)).rejects.toMatchObject({ status: 404 });
    expect((await listChangeRequests(db, an, set.id, new URLSearchParams())).length).toBe(1);
    expect(
      (await listChangeRequests(db, an, set.id, new URLSearchParams({ status: "all" }))).length,
    ).toBe(2);
    const mine = await listChangeRequests(db, bao, set.id, new URLSearchParams({ status: "all" }));
    expect(mine.map((request) => request.id)).toEqual([first.id]);
    const pending = await myChangeRequests(db, an, new URLSearchParams());
    expect(pending).toEqual([
      expect.objectContaining({
        id: second.id,
        setTitle: "An's words",
        author: expect.objectContaining({ name: "Cô Mai" }),
        opCount: 1,
      }),
    ]);
    const authored = await myChangeRequests(db, mai, new URLSearchParams({ role: "author" }));
    expect(authored.map((request) => request.id)).toEqual([second.id]);
    await withdrawChangeRequest(db, mai, second.id);
    expect(await myChangeRequests(db, an, new URLSearchParams())).toEqual([]);
    await expect(withdrawChangeRequest(db, mai, second.id)).rejects.toMatchObject({ status: 409 });
  });
});

describe("review hardening", () => {
  it("caps pending proposals per author and hides cards from authors who lost access", async () => {
    const { klass, set } = await sharedSet();
    const ops = { cards: [editCard(set.cards[0].id, "x")] };
    const ids = [];
    for (let i = 0; i < 5; i++)
      ids.push((await proposeChange(db, bao, set.id, { baseUpdatedAt: set.updatedAt, ops })).id);
    await expect(
      proposeChange(db, bao, set.id, { baseUpdatedAt: set.updatedAt, ops }),
    ).rejects.toMatchObject({ status: 409, code: "CHANGE_REQUEST_LIMIT" });
    expect(
      (await proposeChange(db, mai, set.id, { baseUpdatedAt: set.updatedAt, ops })).id,
    ).toBeTruthy();
    await leaveClass(db, bao, klass.id);
    await expect(getChangeRequest(db, bao, ids[0])).rejects.toMatchObject({ status: 404 });
  });

  it("normalizes class ids in teacher grants", async () => {
    const { klass, set } = await sharedSet();
    await grantCollaborator(db, an, set.id, {
      principalType: "class_teachers",
      principalId: klass.id.toUpperCase(),
    });
    expect((await getSet(db, mai, set.id)).access?.canEdit).toBe(true);
  });

  it("keeps a flagged verdict when a collaborator edits an unlisted set", async () => {
    const { set } = await sharedSet();
    await grantCollaborator(db, an, set.id, { principalType: "user", principalId: bao });
    await db
      .update(schema.studySets)
      .set({ visibility: "unlisted", moderationStatus: "flagged" })
      .where(eq(schema.studySets.id, set.id));
    await updateSet(db, bao, set.id, { ...set, title: "Edited by Bảo", cards: set.cards });
    const [row] = await db.select().from(schema.studySets).where(eq(schema.studySets.id, set.id));
    expect(row.moderationStatus).toBe("flagged");
    await updateSet(db, an, set.id, { ...set, title: "Edited by An", cards: set.cards });
    const [after] = await db.select().from(schema.studySets).where(eq(schema.studySets.id, set.id));
    expect(after.moderationStatus).toBe("none");
  });

  it("keeps a flagged verdict on a public set a collaborator edits", async () => {
    const { set } = await sharedSet();
    await grantCollaborator(db, an, set.id, { principalType: "user", principalId: bao });
    await db
      .update(schema.studySets)
      .set({ visibility: "public", moderationStatus: "flagged", moderationReason: "spam" })
      .where(eq(schema.studySets.id, set.id));
    await updateSet(db, bao, set.id, { ...set, title: "Edited by Bảo", cards: set.cards });
    const [row] = await db.select().from(schema.studySets).where(eq(schema.studySets.id, set.id));
    expect(row).toMatchObject({ moderationStatus: "flagged", moderationReason: "spam" });
  });

  it("ends a personal edit grant once the collaborator no longer shares a class", async () => {
    const { klass, set } = await sharedSet();
    await grantCollaborator(db, an, set.id, { principalType: "user", principalId: bao });
    expect((await getSet(db, bao, set.id)).access?.canEdit).toBe(true);
    await leaveClass(db, bao, klass.id);
    await expect(
      updateSet(db, bao, set.id, { ...set, title: "After leaving", cards: set.cards }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("drops a banned owner's shared cards from the review queue", async () => {
    const { set } = await sharedSet();
    await db.insert(schema.cardProgress).values({
      userId: bao,
      cardId: set.cards[0].id,
      setId: set.id,
      status: "learning",
      reps: 1,
      due: new Date(Date.now() - 60_000),
    });
    expect((await dueCards(db, bao)).cards.length).toBeGreaterThan(0);
    await db.update(schema.user).set({ bannedAt: new Date() }).where(eq(schema.user.id, an));
    expect((await dueCards(db, bao)).cards).toHaveLength(0);
  });
});
