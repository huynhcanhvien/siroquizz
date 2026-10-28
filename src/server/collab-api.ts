import "server-only";
import type { Database } from "./db/client";
import { readJson } from "./api";
import { ApiError } from "./api-error";
import { enforceLimit } from "./rate-limit";
import {
  listClassLibrary,
  listItemShares,
  myClassLibrary,
  shareToClass,
  unshareFromClass,
} from "./services/class-library";
import {
  collaboratorCandidates,
  grantCollaborator,
  revokeCollaborator,
} from "./services/collaborators";
import {
  getChangeRequest,
  listChangeRequests,
  myChangeRequests,
  proposeChange,
  reviewChangeRequest,
  withdrawChangeRequest,
} from "./services/change-requests";
import { setAcceptsContributions } from "./services/sharing";

type Result = { data: unknown } | null;
const done = { data: null };
/** Optional JSON body: a bodiless POST (approve, withdraw) reads as an empty object. */
async function optionalJson(request: Request) {
  return request.headers.get("content-type") ? readJson(request) : {};
}

/** Class library: GET/PUT `classes/:id/library`, DELETE `classes/:id/library/:itemId`. */
async function libraryRoutes(db: Database, userId: string, request: Request, path: string[]) {
  const [domain, id, sub, itemId] = path,
    method = request.method;
  if (domain === "me" && id === "class-library" && path.length === 2 && method === "GET")
    return { data: await myClassLibrary(db, userId) };
  if ((domain === "sets" || domain === "folders") && id && sub === "shares" && path.length === 3) {
    if (method !== "GET") throw new ApiError(404, "NOT_FOUND");
    const type = domain === "sets" ? "set" : "folder";
    return { data: await listItemShares(db, userId, type, id) };
  }
  if (domain !== "classes" || !id || sub !== "library") return null;
  if (path.length === 3 && method === "GET")
    return { data: await listClassLibrary(db, userId, id) };
  if (path.length === 3 && method === "PUT")
    return { data: await shareToClass(db, userId, id, await readJson(request)) };
  if (path.length === 4 && method === "DELETE")
    return (await unshareFromClass(db, userId, id, itemId), done);
  throw new ApiError(404, "NOT_FOUND");
}

/** Owner settings on a set: collaborators and the contributions switch. */
async function collaboratorRoutes(db: Database, userId: string, request: Request, path: string[]) {
  const [domain, id, sub, principalType, principalId] = path,
    method = request.method;
  if (domain !== "sets" || !id) return null;
  if (sub === "contributions" && path.length === 3) {
    if (method !== "PATCH") throw new ApiError(404, "NOT_FOUND");
    return { data: await setAcceptsContributions(db, userId, id, await readJson(request)) };
  }
  if (sub !== "collaborators") return null;
  if (path.length === 3 && method === "GET")
    return { data: await collaboratorCandidates(db, userId, id) };
  if (path.length === 3 && method === "PUT")
    return (await grantCollaborator(db, userId, id, await readJson(request)), done);
  if (path.length === 5 && method === "DELETE")
    return (await revokeCollaborator(db, userId, id, principalType, principalId), done);
  throw new ApiError(404, "NOT_FOUND");
}

/** Change requests: propose/list on a set, read/decide/withdraw one, and the Home list. */
async function changeRequestRoutes(
  db: Database,
  userId: string,
  request: Request,
  path: string[],
): Promise<Result> {
  const [domain, id, sub] = path,
    method = request.method,
    query = new URL(request.url).searchParams;
  if (domain === "me" && id === "change-requests" && path.length === 2 && method === "GET")
    return { data: await myChangeRequests(db, userId, query) };
  if (domain === "sets" && id && sub === "change-requests" && path.length === 3) {
    if (method === "GET") return { data: await listChangeRequests(db, userId, id, query) };
    if (method === "POST") {
      await enforceLimit(`change-request:${userId}`, 30, 3600);
      return { data: await proposeChange(db, userId, id, await readJson(request)) };
    }
    throw new ApiError(404, "NOT_FOUND");
  }
  if (domain !== "change-requests") return null;
  if (id && path.length === 2 && method === "GET")
    return { data: await getChangeRequest(db, userId, id) };
  if (id && path.length === 3 && method === "POST") {
    if (sub === "approve" || sub === "reject")
      return (await reviewChangeRequest(db, userId, id, sub, await optionalJson(request)), done);
    if (sub === "withdraw") return (await withdrawChangeRequest(db, userId, id), done);
  }
  throw new ApiError(404, "NOT_FOUND");
}

/** Class library and set collaboration routes; null for any other path. */
export async function collabApi(
  db: Database,
  userId: string,
  request: Request,
  path: string[],
): Promise<Result> {
  return (
    (await libraryRoutes(db, userId, request, path)) ??
    (await collaboratorRoutes(db, userId, request, path)) ??
    (await changeRequestRoutes(db, userId, request, path))
  );
}
