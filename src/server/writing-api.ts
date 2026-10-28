import "server-only";
import type { Database } from "./db/client";
import { readJson } from "./api";
import { enforceLimit } from "./rate-limit";
import { MAX_SYNC_BODY_BYTES } from "@/features/writing/lib/limits";
import {
  createSession,
  deleteSession,
  getSession,
  listSessions,
  sessionOverview,
  updateSession,
} from "./services/writing";
import { getDocState, openOwnDoc, syncDoc } from "./services/writing-docs";
import {
  clearScratch,
  createScratch,
  deleteScratch,
  listScratch,
  materializeScratch,
  updateScratch,
} from "./services/scratch-cards";

type Result = { data: unknown } | null;

/** POST /writing/docs/:id/sync: the "write-fast" bucket (writePolicy) plus its own 60/min limit. */
async function syncRoute(db: Database, userId: string, request: Request, docId: string) {
  await enforceLimit(`sync:${userId}`, 60, 60);
  return { data: await syncDoc(db, userId, docId, await readJson(request, MAX_SYNC_BODY_BYTES)) };
}

async function sessionRoutes(db: Database, userId: string, request: Request, path: string[]) {
  const [, kind, id, sub] = path;
  const method = request.method;
  if (kind === "sessions" && id && !sub && path.length === 3) {
    if (method === "GET") return { data: await getSession(db, userId, id) };
    if (method === "PATCH")
      return { data: await updateSession(db, userId, id, await readJson(request)) };
    if (method === "DELETE") {
      await deleteSession(db, userId, id);
      return { data: null };
    }
  }
  if (kind === "sessions" && id && sub === "overview" && method === "GET") {
    await enforceLimit(`overview:${userId}`, 30, 60);
    return { data: await sessionOverview(db, userId, id, new URL(request.url).searchParams) };
  }
  if (kind === "sessions" && id && sub === "docs" && method === "POST")
    return { data: await openOwnDoc(db, userId, id) };
  if (kind === "docs" && id && !sub && path.length === 3 && method === "GET")
    return { data: await getDocState(db, userId, id) };
  if (kind === "docs" && id && sub === "sync" && path.length === 4 && method === "POST")
    return syncRoute(db, userId, request, id);
  return null;
}

async function scratchRoutes(db: Database, userId: string, request: Request, path: string[]) {
  const [, , id] = path;
  const method = request.method;
  if (path.length === 2) {
    if (method === "GET") return { data: await listScratch(db, userId) };
    if (method === "POST") {
      await enforceLimit(`scratch:${userId}`, 120, 60);
      return { data: await createScratch(db, userId, await readJson(request)) };
    }
    if (method === "DELETE") {
      await clearScratch(db, userId);
      return { data: null };
    }
  }
  if (path.length !== 3) return null;
  if (id === "materialize" && method === "POST")
    return { data: await materializeScratch(db, userId, await readJson(request)) };
  if (method === "PATCH")
    return { data: await updateScratch(db, userId, id, await readJson(request)) };
  if (method === "DELETE") {
    await deleteScratch(db, userId, id);
    return { data: null };
  }
  return null;
}

/**
 * Writing sessions (`/classes/:id/writing`, `/writing/*`) and scratch cards
 * (`/me/scratch-cards*`). Returns null for paths it does not own so the next router can try.
 */
export async function writingApi(
  db: Database,
  userId: string,
  request: Request,
  path: string[],
): Promise<Result> {
  const [domain, id, sub] = path;
  if (domain === "classes" && id && sub === "writing" && path.length === 3) {
    if (request.method === "GET") return { data: await listSessions(db, userId, id) };
    if (request.method === "POST")
      return { data: await createSession(db, userId, id, await readJson(request)) };
  }
  if (domain === "writing") return sessionRoutes(db, userId, request, path);
  if (domain === "me" && id === "scratch-cards") return scratchRoutes(db, userId, request, path);
  return null;
}
