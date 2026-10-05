import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import { v7 } from "uuid";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/client";
import { createSetInTransaction, getSet, updateSet } from "@/server/services/sets";
import { getProgress, putProgress, saveTest } from "@/server/services/progress";
import { dueCards, reviewCard } from "@/server/services/learning";
import {
  assignSet,
  assignedToMe,
  createClass,
  deleteClass,
  getClass,
  joinClass,
  leaveClass,
  listClasses,
  progressBoard,
  regenerateCode,
  removeMember,
  setMemberRole,
  unassignSet,
  updateClass,
} from "@/server/services/classes";

const url =
  process.env.TEST_DATABASE_URL ??
  "postgresql://siroquizz:siroquizz_local_only@localhost:5433/siroquizz_test";
if (!new URL(url).pathname.endsWith("_test")) throw new Error("Test DB required");
const connection = postgres(url, { max: 3 }),
  db = drizzle(connection, { schema }) as Database,
  teacher = v7(),
  student = v7(),
  outsider = v7(),
  coTeacher = v7();

const makeSet = (owner: string, title: string) =>
  db.transaction((tx) =>
    createSetInTransaction(tx, owner, {
      title,
      description: "",
      termLang: "en",
      definitionLang: "vi",
      source: "manual",
      cards: Array.from({ length: 4 }, (_, i) => ({ term: `${title} ${i}`, definition: `d ${i}` })),
    }),
  );
async function classWithStudent() {
  const { id } = await createClass(db, teacher, { name: "Lớp 10A" });
  const { joinCode } = (await getClass(db, teacher, id)) as { joinCode: string };
  await joinClass(db, student, { code: joinCode.toLowerCase() });
  return { id, joinCode };
}

beforeAll(() => migrate(db, { migrationsFolder: "drizzle" }));
beforeEach(async () => {
  await db.execute(sql`truncate "user" cascade`);
  await db.insert(schema.user).values([
    { id: teacher, name: "Cô Mai", email: "k-teacher@example.com", emailVerified: true },
    { id: student, name: "An", email: "k-student@example.com", emailVerified: true },
    { id: outsider, name: "Người lạ", email: "k-outsider@example.com", emailVerified: true },
    { id: coTeacher, name: "Thầy Bình", email: "k-co@example.com", emailVerified: true },
  ]);
});
afterAll(() => connection.end());

it("teacher assigns a private set, the student studies it and the board shows progress", async () => {
  const { id } = await classWithStudent();
  const set = await makeSet(teacher, "Private words");
  // Not yet assigned: the student cannot open the teacher's private set.
  await expect(getSet(db, student, set.id)).rejects.toMatchObject({ status: 404 });
  await assignSet(db, teacher, id, set.id, { dueAt: "2026-12-01T10:00:00+07:00" });

  const studying = await getSet(db, student, set.id);
  expect(studying.cards).toHaveLength(4);
  expect(studying.sharing).toBeUndefined();
  expect(await assignedToMe(db, student)).toEqual([
    expect.objectContaining({
      className: "Lớp 10A",
      setId: set.id,
      known: 0,
      dueAt: "2026-12-01T03:00:00.000Z",
    }),
  ]);

  await putProgress(db, student, set.id, {
    cards: set.cards.slice(0, 2).map((card) => ({ cardId: card.id, status: "known" })),
  });
  await saveTest(db, student, set.id, { setId: set.id, score: 3, total: 4, durationMs: 60_000 });
  const board = await progressBoard(db, teacher, id);
  expect(board.students).toEqual([{ id: student, name: "An" }]);
  expect(board.cells).toEqual([
    expect.objectContaining({
      studentId: student,
      setId: set.id,
      knownPercent: 50,
      lastTestPercent: 75,
    }),
  ]);
  // The student's progress is theirs; the teacher's own progress is untouched.
  expect(await getProgress(db, teacher, set.id)).toEqual([]);
  // Students can study but never edit the teacher's set.
  await expect(
    updateSet(db, student, set.id, { ...studying, cards: studying.cards }),
  ).rejects.toMatchObject({ status: 404 });
});

it("assigned sets join the student's review queue", async () => {
  const { id } = await classWithStudent();
  const set = await makeSet(teacher, "Due words");
  await assignSet(db, teacher, id, set.id, {});
  await reviewCard(db, student, {
    eventId: v7(),
    cardId: set.cards[0].id,
    rating: 1,
    mode: "review",
    durationMs: 500,
  });
  const due = await dueCards(db, student, 200, new Date(Date.now() + 2 * 86400_000));
  expect(due.cards.map((card) => card.setId)).toContain(set.id);
});

it("leaving the class removes access to its private sets at once", async () => {
  const { id } = await classWithStudent();
  const set = await makeSet(teacher, "Class only");
  await assignSet(db, teacher, id, set.id, {});
  await getSet(db, student, set.id);
  await leaveClass(db, student, id);
  await expect(getSet(db, student, set.id)).rejects.toMatchObject({ status: 404 });
  await expect(
    putProgress(db, student, set.id, { cards: [{ cardId: set.cards[0].id, status: "known" }] }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(getClass(db, student, id)).rejects.toMatchObject({ status: 404 });
  expect(await assignedToMe(db, student)).toEqual([]);
});

it("keeps classes, rosters and progress away from non-members and students", async () => {
  const { id } = await classWithStudent();
  const set = await makeSet(teacher, "Secret");
  await assignSet(db, teacher, id, set.id, {});
  await expect(getClass(db, outsider, id)).rejects.toMatchObject({ status: 404 });
  await expect(getSet(db, outsider, set.id)).rejects.toMatchObject({ status: 404 });
  await expect(progressBoard(db, outsider, id)).rejects.toMatchObject({ status: 404 });
  await expect(progressBoard(db, student, id)).rejects.toMatchObject({ status: 403 });
  await expect(assignSet(db, student, id, set.id, {})).rejects.toMatchObject({ status: 403 });
  const studentView = await getClass(db, student, id);
  expect(studentView).not.toHaveProperty("joinCode");
  expect(studentView.members.map((m) => m.name)).toEqual(["Cô Mai"]);
  const teacherView = await getClass(db, teacher, id);
  expect(teacherView.members.map((m) => m.name).sort()).toEqual(["An", "Cô Mai"]);
  // A teacher can only assign their own sets.
  const foreign = await makeSet(outsider, "Not yours");
  await expect(assignSet(db, teacher, id, foreign.id, {})).rejects.toMatchObject({ status: 404 });
});

it("locks enrolment, rotates the code, and lists classes by role", async () => {
  const { id, joinCode } = await classWithStudent();
  await updateClass(db, teacher, id, { joinLocked: true });
  await expect(joinClass(db, outsider, { code: joinCode })).rejects.toMatchObject({
    code: "CLASS_LOCKED",
  });
  // Existing members re-joining are unaffected.
  await expect(joinClass(db, student, { code: joinCode })).resolves.toEqual({ id });
  await updateClass(db, teacher, id, { joinLocked: false });
  const { joinCode: fresh } = await regenerateCode(db, teacher, id);
  expect(fresh).not.toBe(joinCode);
  await expect(joinClass(db, outsider, { code: joinCode })).rejects.toMatchObject({
    code: "CLASS_NOT_FOUND",
  });
  await joinClass(db, outsider, { code: fresh });
  expect(await listClasses(db, teacher)).toEqual([
    expect.objectContaining({ id, role: "owner", members: 2, sets: 0 }),
  ]);
  expect(await listClasses(db, outsider)).toEqual([expect.objectContaining({ role: "student" })]);
});

it("co-teachers manage students but only the owner manages teachers and deletes", async () => {
  const { id, joinCode } = await classWithStudent();
  await joinClass(db, coTeacher, { code: joinCode });
  await expect(
    setMemberRole(db, student, id, coTeacher, { role: "teacher" }),
  ).rejects.toMatchObject({ status: 403 });
  await setMemberRole(db, teacher, id, coTeacher, { role: "teacher" });
  const coSet = await makeSet(coTeacher, "Co set");
  await assignSet(db, coTeacher, id, coSet.id, {});
  expect((await progressBoard(db, coTeacher, id)).sets.map((s) => s.title)).toEqual(["Co set"]);
  await expect(removeMember(db, coTeacher, id, teacher)).rejects.toMatchObject({ status: 403 });
  await removeMember(db, coTeacher, id, student);
  await expect(getClass(db, student, id)).rejects.toMatchObject({ status: 404 });
  await expect(deleteClass(db, coTeacher, id)).rejects.toMatchObject({ status: 403 });
  await expect(leaveClass(db, teacher, id)).rejects.toMatchObject({ status: 400 });
  await unassignSet(db, coTeacher, id, coSet.id);
  await deleteClass(db, teacher, id);
  expect(await listClasses(db, coTeacher)).toEqual([]);
});
