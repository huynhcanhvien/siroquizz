import "server-only";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "../api-error";
import type { Database } from "../db/client";
import { classMembers, classes, setCollaborators, user } from "../db/schema";
import { canManageClass, requireMembership, type ClassRole } from "./classes";
import { requireOwnedSet, type Db } from "./sets";

export const MAX_COLLABORATORS_PER_SET = 50;
const principalTypeSchema = z.enum(["user", "class_teachers"]);
const principalInput = z.object({
  principalType: principalTypeSchema,
  principalId: z.string().min(1).max(64),
});

/** Named collaborators must share at least one class with the owner. */
async function sharesClass(db: Db, ownerId: string, memberId: string) {
  const [row] = await db.execute<{ ok: boolean }>(sql`select exists(
    select 1 from class_members mine
    inner join class_members theirs on theirs.class_id = mine.class_id and theirs.user_id = ${memberId}
    where mine.user_id = ${ownerId}) as ok`);
  return Boolean(row?.ok);
}
async function checkPrincipal(db: Db, ownerId: string, input: z.infer<typeof principalInput>) {
  if (input.principalType === "class_teachers") {
    await requireMembership(db, ownerId, input.principalId);
    return;
  }
  if (input.principalId === ownerId) throw new ApiError(400, "VALIDATION_ERROR");
  if (!(await sharesClass(db, ownerId, input.principalId))) throw new ApiError(403, "NOT_CLASSMATE");
}

/** Gives lasting edit rights on the owner's set (idempotent). */
export async function grantCollaborator(
  db: Database,
  ownerId: string,
  setId: string,
  input: unknown,
) {
  const data = principalInput.parse(input);
  await db.transaction(async (tx) => {
    await requireOwnedSet(tx, ownerId, setId, "update");
    await checkPrincipal(tx, ownerId, data);
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(setCollaborators)
      .where(eq(setCollaborators.setId, setId));
    if (count >= MAX_COLLABORATORS_PER_SET) throw new ApiError(409, "CONFLICT");
    await tx
      .insert(setCollaborators)
      .values({ setId, ...data, grantedBy: ownerId })
      .onConflictDoNothing();
  });
}
export async function revokeCollaborator(
  db: Database,
  ownerId: string,
  setId: string,
  principalType: string,
  principalId: string,
) {
  const data = principalInput.parse({ principalType, principalId });
  await requireOwnedSet(db, ownerId, setId);
  await db
    .delete(setCollaborators)
    .where(
      and(
        eq(setCollaborators.setId, setId),
        eq(setCollaborators.principalType, data.principalType),
        eq(setCollaborators.principalId, data.principalId),
      ),
    );
}

/** The collaborator dialog: per class of the owner, who they may pick and who is granted. */
export async function collaboratorCandidates(db: Database, ownerId: string, setId: string) {
  await requireOwnedSet(db, ownerId, setId);
  const myClasses = await db
    .select({ classId: classes.id, className: classes.name, myRole: classMembers.role })
    .from(classMembers)
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .where(eq(classMembers.userId, ownerId))
    .orderBy(asc(classes.name));
  const grants = await db
    .select({ type: setCollaborators.principalType, id: setCollaborators.principalId })
    .from(setCollaborators)
    .where(eq(setCollaborators.setId, setId));
  const granted = new Set(grants.map((grant) => `${grant.type}:${grant.id}`));
  const members = myClasses.length
    ? await db
        .select({
          classId: classMembers.classId,
          userId: user.id,
          name: user.name,
          avatarColor: user.avatarColor,
          role: classMembers.role,
        })
        .from(classMembers)
        .innerJoin(user, eq(user.id, classMembers.userId))
        .where(
          and(
            inArray(
              classMembers.classId,
              myClasses.map((klass) => klass.classId),
            ),
            ne(classMembers.userId, ownerId),
          ),
        )
        .orderBy(asc(classMembers.role), asc(user.name))
    : [];
  return {
    classes: myClasses.map((klass) => ({
      ...klass,
      teachersGranted: granted.has(`class_teachers:${klass.classId}`),
      members: members
        .filter((member) => member.classId === klass.classId)
        // Like the class page: students see only who teaches.
        .filter((member) => canManageClass(klass.myRole as ClassRole) || canManageClass(member.role))
        .map(({ classId: _classId, ...member }) => ({
          ...member,
          granted: granted.has(`user:${member.userId}`),
        })),
    })),
  };
}
