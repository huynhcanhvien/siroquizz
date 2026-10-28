import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { v7 } from "uuid";
import { base64Bytes, fromBase64, toBase64 } from "@/features/writing/lib/base64";
import {
  MAX_STATE_BYTES,
  MAX_SYNC_UPDATE_BYTES,
  PREVIEW_CHARS,
} from "@/features/writing/lib/limits";
import { canWriteDoc, teaches } from "@/features/writing/lib/permissions";
import { syncRequestSchema, type SyncResponse } from "@/features/writing/schemas";
import { ApiError } from "../api-error";
import type { Database } from "../db/client";
import { writingDocs, writingSessions } from "../db/schema";
import {
  applyClientUpdate,
  diffSince,
  docFromState,
  encodeState,
  plainText,
  preview,
} from "../lib/ydoc";
import type { Transaction } from "./sets";
import { gateOf, requireDocAccess, requireSessionAccess, writeRefused } from "./writing-access";

const decode = (value: string) => {
  try {
    return fromBase64(value);
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR");
  }
};
const tooLarge = () => new ApiError(413, "DOC_TOO_LARGE");

/**
 * The viewer's own document in the session, created on first open. Students can only start
 * writing while the session is open.
 */
export async function openOwnDoc(db: Database, userId: string, sessionId: string) {
  const { session, role } = await requireSessionAccess(db, userId, sessionId);
  const where = and(eq(writingDocs.sessionId, session.id), eq(writingDocs.authorId, userId));
  const [existing] = await db.select({ id: writingDocs.id }).from(writingDocs).where(where);
  if (existing) return existing;
  if (!teaches(role) && session.status !== "open")
    throw new ApiError(403, session.status === "closed" ? "SESSION_CLOSED" : "FORBIDDEN");
  await db
    .insert(writingDocs)
    .values({ id: v7(), sessionId: session.id, authorId: userId })
    .onConflictDoNothing();
  const [doc] = await db.select({ id: writingDocs.id }).from(writingDocs).where(where);
  return doc;
}

const loadState = async (db: Database, docId: string) =>
  (
    await db.select({ state: writingDocs.state }).from(writingDocs).where(eq(writingDocs.id, docId))
  )[0]?.state ?? null;

/** The whole document to start editing from, and whether the viewer may change it. */
export async function getDocState(db: Database, userId: string, docId: string) {
  const { doc, canWrite } = await requireDocAccess(db, userId, docId, "read");
  const state = await loadState(db, doc.id);
  return {
    id: doc.id,
    sessionId: doc.sessionId,
    authorId: doc.authorId,
    version: doc.version,
    state: state?.length ? toBase64(state) : null,
    readOnly: !canWrite,
  };
}

type DocAccess = Awaited<ReturnType<typeof requireDocAccess>>;

/**
 * Re-reads the session's settings under a share lock, so a write racing the teacher closing the
 * session (or turning peer editing off) waits for that change and is then refused.
 */
async function assertStillWritable(tx: Transaction, userId: string, access: DocAccess) {
  const [gate] = await tx
    .select({
      status: writingSessions.status,
      peerVisibility: writingSessions.peerVisibility,
      peerEditing: writingSessions.peerEditing,
    })
    .from(writingSessions)
    .where(eq(writingSessions.id, access.session.id))
    .for("share");
  if (!gate) throw new ApiError(404, "NOT_FOUND");
  if (!canWriteDoc(access.role, userId, access.doc.authorId, gate, access.authorRole))
    throw writeRefused(gate);
}

/** Merges the update under a row lock and saves the compacted state; returns the merged doc. */
async function mergeUpdate(db: Database, userId: string, access: DocAccess, update: Uint8Array) {
  const docId = access.doc.id;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ state: writingDocs.state })
      .from(writingDocs)
      .where(eq(writingDocs.id, docId))
      .for("update");
    await assertStillWritable(tx, userId, access);
    const doc = docFromState(row?.state ?? null);
    applyClientUpdate(doc, update, userId);
    const state = encodeState(doc);
    if (state.length > MAX_STATE_BYTES) throw tooLarge();
    const text = plainText(doc);
    const [saved] = await tx
      .update(writingDocs)
      .set({
        state,
        version: sql`${writingDocs.version} + 1`,
        textPreview: preview(text, PREVIEW_CHARS),
        charCount: [...text].length,
        lastEditorId: userId,
        // The database clock at write time, which the roster's `since` polling also uses.
        updatedAt: sql`clock_timestamp()`,
      })
      .where(eq(writingDocs.id, docId))
      .returning({ version: writingDocs.version });
    return { doc, version: saved.version };
  });
}

/**
 * One round of the sync protocol (C6): apply the client's pending update if any, then answer
 * with what the client is missing. A poll whose version is current costs one indexed select.
 * Yjs merges commute and are idempotent, so there is never a conflict to report.
 */
export async function syncDoc(
  db: Database,
  userId: string,
  docId: string,
  input: unknown,
): Promise<SyncResponse> {
  const request = syncRequestSchema.parse(input);
  if (request.update && base64Bytes(request.update) > MAX_SYNC_UPDATE_BYTES) throw tooLarge();
  const access = await requireDocAccess(db, userId, docId, request.update ? "write" : "read");
  const base = { readOnly: !access.canWrite, session: gateOf(access.session) };
  if (!request.update && request.version === access.doc.version)
    return { version: access.doc.version, ...base };
  const sv = decode(request.sv);
  const { doc, version } = request.update
    ? await mergeUpdate(db, userId, access, decode(request.update))
    : { doc: docFromState(await loadState(db, access.doc.id)), version: access.doc.version };
  const diff = diffSince(doc, sv);
  return { version, ...(diff ? { update: toBase64(diff) } : {}), ...base };
}
