import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { v7 } from "uuid";
import { z } from "zod";
import { ApiError } from "../api-error";
import type { Database } from "../db/client";
import {
  cardProgress,
  classMembers,
  classSets,
  classes,
  studyActivity,
  studySets,
  testResults,
  user,
} from "../db/schema";
import { requireOwnedSet, type Db } from "./sets";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const MAX_MEMBERS = 200;
const MAX_CLASSES_OWNED = 50;
export type ClassRole = "owner" | "teacher" | "student";
const TEACHING: readonly ClassRole[] = ["owner", "teacher"];

export function newJoinCode() {
  return Array.from(randomBytes(CODE_LENGTH), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join(
    "",
  );
}
async function uniqueCode(db: Db) {
  for (;;) {
    const code = newJoinCode();
    const [taken] = await db
      .select({ id: classes.id })
      .from(classes)
      .where(eq(classes.joinCode, code));
    if (!taken) return code;
  }
}

/** The person's role in a class, or 404 when they are not a member (no class enumeration). */
async function requireMembership(db: Db, userId: string, classId: string) {
  const [row] = await db
    .select({ class: classes, role: classMembers.role })
    .from(classMembers)
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .where(and(eq(classMembers.classId, z.uuid().parse(classId)), eq(classMembers.userId, userId)))
    .limit(1);
  if (!row) throw new ApiError(404, "NOT_FOUND");
  return row;
}
/** Owner and co-teachers manage the class; students only study in it. */
export const canManageClass = (role: ClassRole) => TEACHING.includes(role);
async function requireTeaching(db: Db, userId: string, classId: string) {
  const membership = await requireMembership(db, userId, classId);
  if (!canManageClass(membership.role)) throw new ApiError(403, "FORBIDDEN");
  return membership;
}
async function requireOwner(db: Db, userId: string, classId: string) {
  const membership = await requireMembership(db, userId, classId);
  if (membership.role !== "owner") throw new ApiError(403, "FORBIDDEN");
  return membership;
}

const classInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(""),
});
export async function createClass(db: Database, userId: string, input: unknown) {
  const data = classInput.parse(input);
  return db.transaction(async (tx) => {
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(classes)
      .where(eq(classes.ownerId, userId));
    if (count >= MAX_CLASSES_OWNED) throw new ApiError(409, "CONFLICT");
    const id = v7();
    await tx
      .insert(classes)
      .values({ id, ownerId: userId, ...data, joinCode: await uniqueCode(tx) });
    await tx.insert(classMembers).values({ classId: id, userId, role: "owner" });
    return { id };
  });
}

/** Classes the person teaches or attends, with simple counts. */
export async function listClasses(db: Database, userId: string) {
  const rows = await db
    .select({
      id: classes.id,
      name: classes.name,
      role: classMembers.role,
      members: sql<number>`(select count(*)::int from class_members m where m.class_id = ${classes.id} and m.role = 'student')`,
      sets: sql<number>`(select count(*)::int from class_sets s where s.class_id = ${classes.id})`,
    })
    .from(classMembers)
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .where(eq(classMembers.userId, userId))
    .orderBy(asc(classes.name));
  return rows;
}

/**
 * A class as the viewer sees it. Everyone gets the name, teachers and assigned sets; teachers
 * also get the join code and the member list.
 */
export async function getClass(db: Database, userId: string, classId: string) {
  const { class: klass, role } = await requireMembership(db, userId, classId);
  const assigned = await db
    .select({
      setId: studySets.id,
      title: studySets.title,
      cardCount: studySets.cardCount,
      dueAt: classSets.dueAt,
      assignedAt: classSets.assignedAt,
    })
    .from(classSets)
    .innerJoin(studySets, eq(studySets.id, classSets.setId))
    .where(and(eq(classSets.classId, classId), isNull(studySets.deletedAt)))
    .orderBy(asc(classSets.dueAt), desc(classSets.assignedAt));
  const members = await db
    .select({
      userId: user.id,
      name: user.name,
      avatarColor: user.avatarColor,
      role: classMembers.role,
    })
    .from(classMembers)
    .innerJoin(user, eq(user.id, classMembers.userId))
    .where(
      and(
        eq(classMembers.classId, classId),
        // Students see who teaches; only teachers see the whole roster.
        canManageClass(role) ? undefined : inArray(classMembers.role, ["owner", "teacher"]),
      ),
    )
    .orderBy(asc(classMembers.role), asc(user.name));
  return {
    id: klass.id,
    name: klass.name,
    description: klass.description,
    role,
    ...(canManageClass(role) ? { joinCode: klass.joinCode, joinLocked: klass.joinLocked } : {}),
    members,
    sets: assigned.map((set) => ({
      ...set,
      dueAt: set.dueAt?.toISOString() ?? null,
      assignedAt: set.assignedAt.toISOString(),
    })),
  };
}

const updateInput = classInput.partial().extend({ joinLocked: z.boolean().optional() });
export async function updateClass(db: Database, userId: string, classId: string, input: unknown) {
  const data = updateInput.parse(input);
  await requireTeaching(db, userId, classId);
  await db
    .update(classes)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(classes.id, classId));
}
/** A new code stops the old one (and old invite links) from working. */
export async function regenerateCode(db: Database, userId: string, classId: string) {
  await requireOwner(db, userId, classId);
  const joinCode = await uniqueCode(db);
  await db.update(classes).set({ joinCode, updatedAt: new Date() }).where(eq(classes.id, classId));
  return { joinCode };
}
export async function deleteClass(db: Database, userId: string, classId: string) {
  await requireOwner(db, userId, classId);
  await db.delete(classes).where(eq(classes.id, classId));
}

/** Joins as a student with a class code (idempotent for existing members). */
export async function joinClass(db: Database, userId: string, input: unknown) {
  const { code } = z
    .object({ code: z.string().trim().toUpperCase().length(CODE_LENGTH) })
    .parse(input);
  return db.transaction(async (tx) => {
    const [klass] = await tx.select().from(classes).where(eq(classes.joinCode, code)).for("update");
    if (!klass) throw new ApiError(404, "CLASS_NOT_FOUND");
    const [existing] = await tx
      .select({ role: classMembers.role })
      .from(classMembers)
      .where(and(eq(classMembers.classId, klass.id), eq(classMembers.userId, userId)));
    if (existing) return { id: klass.id };
    if (klass.joinLocked) throw new ApiError(403, "CLASS_LOCKED");
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(classMembers)
      .where(eq(classMembers.classId, klass.id));
    if (count >= MAX_MEMBERS) throw new ApiError(409, "CLASS_FULL");
    await tx.insert(classMembers).values({ classId: klass.id, userId, role: "student" });
    return { id: klass.id };
  });
}
/** Leaving drops access to the class's sets immediately. The owner deletes instead. */
export async function leaveClass(db: Database, userId: string, classId: string) {
  const { role } = await requireMembership(db, userId, classId);
  if (role === "owner") throw new ApiError(400, "VALIDATION_ERROR");
  await db
    .delete(classMembers)
    .where(and(eq(classMembers.classId, classId), eq(classMembers.userId, userId)));
}
/** Teachers remove students; only the owner removes or promotes co-teachers. */
export async function removeMember(
  db: Database,
  userId: string,
  classId: string,
  memberId: string,
) {
  const { role } = await requireTeaching(db, userId, classId);
  const [target] = await db
    .select({ role: classMembers.role })
    .from(classMembers)
    .where(and(eq(classMembers.classId, classId), eq(classMembers.userId, memberId)));
  if (!target) throw new ApiError(404, "NOT_FOUND");
  if (target.role === "owner" || (target.role === "teacher" && role !== "owner"))
    throw new ApiError(403, "FORBIDDEN");
  await db
    .delete(classMembers)
    .where(and(eq(classMembers.classId, classId), eq(classMembers.userId, memberId)));
}
export async function setMemberRole(
  db: Database,
  userId: string,
  classId: string,
  memberId: string,
  input: unknown,
) {
  const { role } = z.object({ role: z.enum(["teacher", "student"]) }).parse(input);
  await requireOwner(db, userId, classId);
  const updated = await db
    .update(classMembers)
    .set({ role })
    .where(
      and(
        eq(classMembers.classId, classId),
        eq(classMembers.userId, memberId),
        inArray(classMembers.role, ["teacher", "student"]),
      ),
    )
    .returning({ userId: classMembers.userId });
  if (!updated.length) throw new ApiError(404, "NOT_FOUND");
}

const assignInput = z.object({ dueAt: z.iso.datetime({ offset: true }).nullable().default(null) });
/** Gives the class one of the teacher's own sets to study, optionally with a due date. */
export async function assignSet(
  db: Database,
  userId: string,
  classId: string,
  setId: string,
  input: unknown,
) {
  const { dueAt } = assignInput.parse(input);
  await requireTeaching(db, userId, classId);
  await requireOwnedSet(db, userId, setId);
  await db
    .insert(classSets)
    .values({ classId, setId, assignedBy: userId, dueAt: dueAt ? new Date(dueAt) : null })
    .onConflictDoUpdate({
      target: [classSets.classId, classSets.setId],
      set: { dueAt: dueAt ? new Date(dueAt) : null },
    });
}
export async function unassignSet(db: Database, userId: string, classId: string, setId: string) {
  await requireTeaching(db, userId, classId);
  await db
    .delete(classSets)
    .where(and(eq(classSets.classId, classId), eq(classSets.setId, z.uuid().parse(setId))));
}

/** "Assigned to me" on Home: sets from every class the person studies in, soonest due first. */
export async function assignedToMe(db: Database, userId: string) {
  const rows = await db
    .select({
      classId: classes.id,
      className: classes.name,
      setId: studySets.id,
      title: studySets.title,
      cardCount: studySets.cardCount,
      dueAt: classSets.dueAt,
      known: sql<number>`(select count(*)::int from card_progress p where p.user_id = ${userId} and p.set_id = ${studySets.id} and p.status = 'known')`,
    })
    .from(classMembers)
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .innerJoin(classSets, eq(classSets.classId, classes.id))
    .innerJoin(studySets, eq(studySets.id, classSets.setId))
    .where(
      and(
        eq(classMembers.userId, userId),
        eq(classMembers.role, "student"),
        isNull(studySets.deletedAt),
        isNull(studySets.hiddenAt),
      ),
    )
    .orderBy(sql`${classSets.dueAt} asc nulls last`, asc(studySets.title))
    .limit(50);
  return rows.map((row) => ({ ...row, dueAt: row.dueAt?.toISOString() ?? null }));
}

export interface ProgressCell {
  studentId: string;
  setId: string;
  knownPercent: number;
  lastTestPercent: number | null;
  lastStudiedAt: string | null;
}
/**
 * Teacher's board: every student against every assigned set. Progress is read only for the
 * class's assigned sets, never for anything else the students study.
 */
export async function progressBoard(db: Database, userId: string, classId: string) {
  await requireTeaching(db, userId, classId);
  const [students, sets] = await Promise.all([
    db
      .select({ id: user.id, name: user.name })
      .from(classMembers)
      .innerJoin(user, eq(user.id, classMembers.userId))
      .where(and(eq(classMembers.classId, classId), eq(classMembers.role, "student")))
      .orderBy(asc(user.name)),
    db
      .select({ id: studySets.id, title: studySets.title, cardCount: studySets.cardCount })
      .from(classSets)
      .innerJoin(studySets, eq(studySets.id, classSets.setId))
      .where(and(eq(classSets.classId, classId), isNull(studySets.deletedAt)))
      .orderBy(asc(studySets.title)),
  ]);
  if (!students.length || !sets.length) return { students, sets, cells: [] as ProgressCell[] };
  const studentIds = students.map((s) => s.id),
    setIds = sets.map((s) => s.id);
  const [known, tests, activity] = await Promise.all([
    db
      .select({
        userId: cardProgress.userId,
        setId: cardProgress.setId,
        count: sql<number>`count(*)::int`,
      })
      .from(cardProgress)
      .where(
        and(
          inArray(cardProgress.userId, studentIds),
          inArray(cardProgress.setId, setIds),
          eq(cardProgress.status, "known"),
        ),
      )
      .groupBy(cardProgress.userId, cardProgress.setId),
    db
      .selectDistinctOn([testResults.userId, testResults.setId], {
        userId: testResults.userId,
        setId: testResults.setId,
        score: testResults.score,
        total: testResults.total,
      })
      .from(testResults)
      .where(and(inArray(testResults.userId, studentIds), inArray(testResults.setId, setIds)))
      .orderBy(testResults.userId, testResults.setId, desc(testResults.takenAt)),
    db
      .select({
        userId: studyActivity.userId,
        setId: studyActivity.setId,
        at: sql<Date>`max(${studyActivity.at})`,
      })
      .from(studyActivity)
      .where(and(inArray(studyActivity.userId, studentIds), inArray(studyActivity.setId, setIds)))
      .groupBy(studyActivity.userId, studyActivity.setId),
  ]);
  const key = (u: string, s: string) => `${u}:${s}`;
  const knownMap = new Map(known.map((row) => [key(row.userId, row.setId), row.count]));
  const testMap = new Map(tests.map((row) => [key(row.userId, row.setId), row]));
  const activityMap = new Map(activity.map((row) => [key(row.userId, row.setId), row.at]));
  const cells: ProgressCell[] = students.flatMap((student) =>
    sets.map((set) => {
      const test = testMap.get(key(student.id, set.id));
      const last = activityMap.get(key(student.id, set.id));
      return {
        studentId: student.id,
        setId: set.id,
        knownPercent: Math.round(
          (100 * (knownMap.get(key(student.id, set.id)) ?? 0)) / set.cardCount,
        ),
        lastTestPercent: test && test.total ? Math.round((100 * test.score) / test.total) : null,
        lastStudiedAt: last ? new Date(last).toISOString() : null,
      };
    }),
  );
  return { students, sets, cells };
}
