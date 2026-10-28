import "server-only";
import { and, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { v7 } from "uuid";
import { z } from "zod";
import {
  baseOpsSchema,
  changeOpsSchema,
  type ChangeRequestDetail,
  type ChangeRequestSummary,
  type PendingReviewItem,
} from "@/features/sets/collab/schemas";
import { ApiError } from "../api-error";
import type { Database } from "../db/client";
import {
  auditLogs,
  cardImages,
  cards,
  classes,
  setChangeRequests,
  studySets,
  user,
} from "../db/schema";
import { requireStudySet } from "./access";
import { requireMembership } from "./classes";
import { markEdited } from "./sharing";
import { applyCardOps, requireOwnedSet, toCardDto, type Db } from "./sets";

export const MAX_PENDING_REQUESTS_PER_SET = 20;
const PENDING_REVIEWS_LIMIT = 20;
const LIST_LIMIT = 100;
const proposeInput = z.object({
  classId: z.uuid().nullable().default(null),
  note: z.string().trim().max(500).default(""),
  baseUpdatedAt: z.iso.datetime({ offset: true }),
  ops: changeOpsSchema,
});
const reviewInput = z.object({ reviewNote: z.string().trim().max(500).default("") });
const statusQuery = z.object({ status: z.enum(["pending", "all"]).default("pending") });
type RequestRow = typeof setChangeRequests.$inferSelect;
type Ops = z.infer<typeof baseOpsSchema>;

/** Edits and deletions must name cards of this set (additions get ids on approval). */
async function requireOwnCards(db: Db, setId: string, ops: Ops) {
  const ids = [...new Set(ops.cards.flatMap((op) => (op.op === "add" ? [] : [op.cardId])))];
  if (!ids.length) return;
  if (!ids.every((id) => z.uuid().safeParse(id).success))
    throw new ApiError(400, "VALIDATION_ERROR");
  const found = await db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.setId, setId), inArray(cards.id, ids)));
  if (found.length !== ids.length) throw new ApiError(400, "VALIDATION_ERROR");
}

/**
 * Anyone who can study a set (but does not own it) proposes an edit, unless the owner closed
 * contributions. A set holds at most 20 pending proposals.
 */
export async function proposeChange(db: Database, userId: string, setId: string, input: unknown) {
  const data = proposeInput.parse(input);
  const set = await requireStudySet(db, userId, setId);
  if (set.ownerId === userId) throw new ApiError(403, "FORBIDDEN");
  if (!set.acceptsContributions) throw new ApiError(403, "CONTRIBUTIONS_CLOSED");
  if (data.classId) await requireMembership(db, userId, data.classId);
  await requireOwnCards(db, set.id, data.ops);
  return db.transaction(async (tx) => {
    // Serializes the pending count per set without touching the set row learners lock.
    await tx.execute(sql`select pg_advisory_xact_lock(735175, hashtext(${set.id}))`);
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(setChangeRequests)
      .where(and(eq(setChangeRequests.setId, set.id), eq(setChangeRequests.status, "pending")));
    if (count >= MAX_PENDING_REQUESTS_PER_SET) throw new ApiError(409, "CHANGE_REQUEST_LIMIT");
    const id = v7();
    await tx.insert(setChangeRequests).values({
      id,
      setId: set.id,
      classId: data.classId,
      authorId: userId,
      ops: data.ops,
      baseUpdatedAt: new Date(data.baseUpdatedAt),
      note: data.note,
    });
    return { id };
  });
}

const summaryFields = {
  request: setChangeRequests,
  authorName: user.name,
  authorColor: user.avatarColor,
  setUpdatedAt: studySets.updatedAt,
  setOwnerId: studySets.ownerId,
  setTitle: studySets.title,
  className: classes.name,
};
/** Requests joined to their author, live set and (optional) class. */
function requestRows(db: Db, where: SQL | undefined) {
  return db
    .select(summaryFields)
    .from(setChangeRequests)
    .innerJoin(user, eq(user.id, setChangeRequests.authorId))
    .innerJoin(studySets, eq(studySets.id, setChangeRequests.setId))
    .leftJoin(classes, eq(classes.id, setChangeRequests.classId))
    .where(and(where, isNull(studySets.deletedAt)));
}
type SummaryRow = Awaited<ReturnType<typeof requestRows>>[number];
const opCountOf = (ops: Ops) =>
  ops.cards.length + Number(ops.title !== undefined) + Number(ops.description !== undefined);
function toSummary(row: SummaryRow): ChangeRequestSummary {
  const { request } = row;
  const ops = baseOpsSchema.parse(request.ops);
  return {
    id: request.id,
    setId: request.setId,
    classId: request.classId,
    status: request.status,
    note: request.note,
    reviewNote: request.reviewNote,
    opCount: opCountOf(ops),
    titleChanged: ops.title !== undefined,
    author: { id: request.authorId, name: row.authorName, avatarColor: row.authorColor },
    createdAt: request.createdAt.toISOString(),
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
    stale: row.setUpdatedAt.getTime() > request.baseUpdatedAt.getTime(),
  };
}

/** The owner sees every proposal on the set; anyone else only their own. */
export async function listChangeRequests(
  db: Database,
  userId: string,
  setId: string,
  query: URLSearchParams,
): Promise<ChangeRequestSummary[]> {
  const { status } = statusQuery.parse(Object.fromEntries(query));
  const set = await requireStudySet(db, userId, setId);
  const rows = await requestRows(
    db,
    and(
      eq(setChangeRequests.setId, set.id),
      set.ownerId === userId ? undefined : eq(setChangeRequests.authorId, userId),
      status === "pending" ? eq(setChangeRequests.status, "pending") : undefined,
    ),
  )
    .orderBy(desc(setChangeRequests.createdAt))
    .limit(LIST_LIMIT);
  return rows.map(toSummary);
}

/** One proposal with the current version of each card it touches (owner or author only). */
export async function getChangeRequest(
  db: Database,
  userId: string,
  id: string,
): Promise<ChangeRequestDetail> {
  const [row] = await requestRows(db, eq(setChangeRequests.id, z.uuid().parse(id))).limit(1);
  if (!row || (row.setOwnerId !== userId && row.request.authorId !== userId))
    throw new ApiError(404, "NOT_FOUND");
  const ops = baseOpsSchema.parse(row.request.ops);
  const current = await db
    .select({ card: cards, image: cardImages })
    .from(cards)
    .leftJoin(cardImages, eq(cardImages.cardId, cards.id))
    .where(eq(cards.setId, row.request.setId));
  const byId = new Map(current.map((entry) => [entry.card.id, toCardDto(entry)]));
  return {
    ...toSummary(row),
    ...(ops.title !== undefined ? { title: ops.title } : {}),
    ...(ops.description !== undefined ? { description: ops.description } : {}),
    cards: ops.cards.map((op) =>
      op.op === "add" ? op : { ...op, before: byId.get(op.cardId) ?? null },
    ),
  };
}

/** Locks a pending-or-not request row; 404 when it does not exist. */
async function lockRequest(tx: Db, id: string): Promise<RequestRow> {
  const [request] = await tx
    .select()
    .from(setChangeRequests)
    .where(eq(setChangeRequests.id, z.uuid().parse(id)))
    .for("update");
  if (!request) throw new ApiError(404, "NOT_FOUND");
  return request;
}

/**
 * The owner approves (applying the ops in the same transaction) or rejects a pending proposal.
 * A request already decided is a 409; an approval leaving an invalid set is a 400.
 */
export async function reviewChangeRequest(
  db: Database,
  userId: string,
  id: string,
  action: "approve" | "reject",
  input: unknown,
) {
  const { reviewNote } = reviewInput.parse(input ?? {});
  const request = await db.transaction(async (tx) => {
    const locked = await lockRequest(tx, id);
    const set = await requireOwnedSet(tx, userId, locked.setId, "update");
    if (locked.status !== "pending") throw new ApiError(409, "CONFLICT");
    if (action === "approve") await applyCardOps(tx, set, baseOpsSchema.parse(locked.ops));
    await tx
      .update(setChangeRequests)
      .set({
        status: action === "approve" ? "approved" : "rejected",
        reviewNote,
        reviewedBy: userId,
        reviewedAt: new Date(),
      })
      .where(eq(setChangeRequests.id, locked.id));
    await tx.insert(auditLogs).values({
      id: v7(),
      actorId: userId,
      action: `change_request.${action}`,
      targetType: "set",
      targetId: set.id,
      meta: { requestId: locked.id, authorId: locked.authorId },
    });
    return locked;
  });
  // Approved content needs a new moderation verdict, like any edit.
  if (action === "approve") await markEdited(db, request.setId);
}

/** The author takes back a proposal that is still pending. */
export async function withdrawChangeRequest(db: Database, userId: string, id: string) {
  await db.transaction(async (tx) => {
    const request = await lockRequest(tx, id);
    if (request.authorId !== userId) throw new ApiError(403, "FORBIDDEN");
    if (request.status !== "pending") throw new ApiError(409, "CONFLICT");
    await tx
      .update(setChangeRequests)
      .set({ status: "withdrawn" })
      .where(eq(setChangeRequests.id, request.id));
  });
}

const mineQuery = statusQuery.extend({ role: z.enum(["owner", "author"]).default("owner") });
/** Home: proposals waiting on sets the person owns, or (role=author) the person's own. */
export async function myChangeRequests(
  db: Database,
  userId: string,
  query: URLSearchParams,
): Promise<PendingReviewItem[]> {
  const { status, role } = mineQuery.parse(Object.fromEntries(query));
  const rows = await requestRows(
    db,
    and(
      role === "author" ? eq(setChangeRequests.authorId, userId) : eq(studySets.ownerId, userId),
      status === "pending" ? eq(setChangeRequests.status, "pending") : undefined,
    ),
  )
    .orderBy(desc(setChangeRequests.createdAt))
    .limit(PENDING_REVIEWS_LIMIT);
  return rows.map((row) => ({
    id: row.request.id,
    setId: row.request.setId,
    setTitle: row.setTitle,
    author: { id: row.request.authorId, name: row.authorName, avatarColor: row.authorColor },
    opCount: opCountOf(baseOpsSchema.parse(row.request.ops)),
    createdAt: row.request.createdAt.toISOString(),
    className: row.className,
  }));
}
