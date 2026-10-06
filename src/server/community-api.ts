import "server-only";
import type { Database } from "./db/client";
import { readJson } from "./api";
import { ApiError } from "./api-error";
import { enforceLimit } from "./rate-limit";
import { adminApi } from "./admin-api";
import { createReport } from "./services/reports";
import {
  copyPublicSet,
  getPublicSet,
  retryModeration,
  setTags,
  setVisibility,
} from "./services/sharing";
import { getProfileSettings, updateProfileSettings } from "./services/profiles";
import { finishGameSession, leaderboard, startGameSession } from "./services/games";
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
} from "./services/classes";
import {
  addSetToFolder,
  createFolder,
  deleteFolder,
  folderStudySet,
  foldersOfSet,
  getFolder,
  listFolders,
  removeSetFromFolder,
  renameFolder,
} from "./services/folders";

/** Ranked games: start (server seed), finish (server replay) and per-set leaderboards. */
async function gameRoutes(db: Database, userId: string, request: Request, path: string[]) {
  const [domain, id, sub] = path,
    method = request.method;
  if (domain === "sets" && id && path.length === 3) {
    if (sub === "game-sessions" && method === "POST") {
      await enforceLimit(`game-session:${userId}`, 60, 3600);
      return { data: await startGameSession(db, userId, id, await readJson(request)) };
    }
    if (sub === "leaderboard" && method === "GET")
      return { data: await leaderboard(db, userId, id, new URL(request.url).searchParams) };
  }
  if (
    domain === "game-sessions" &&
    id &&
    sub === "finish" &&
    path.length === 3 &&
    method === "POST"
  )
    return { data: await finishGameSession(db, userId, id, await readJson(request)) };
  return null;
}

/** Classes: create/join/leave, roster, assignments and the teacher's progress board. */
async function classRoutes(db: Database, userId: string, request: Request, path: string[]) {
  const [domain, id, sub, memberOrSet] = path,
    method = request.method;
  if (domain !== "classes") return null;
  const body = () => readJson(request);
  if (!id) {
    if (method === "GET") return { data: await listClasses(db, userId) };
    if (method === "POST") return { data: await createClass(db, userId, await body()) };
  }
  if (id === "join" && path.length === 2 && method === "POST") {
    await enforceLimit(`class-join:${userId}`, 20, 3600);
    return { data: await joinClass(db, userId, await body()) };
  }
  if (id === "assigned" && path.length === 2 && method === "GET")
    return { data: await assignedToMe(db, userId) };
  const done = { data: null };
  if (id && path.length === 2) {
    if (method === "GET") return { data: await getClass(db, userId, id) };
    if (method === "PATCH") return (await updateClass(db, userId, id, await body()), done);
    if (method === "DELETE") return (await deleteClass(db, userId, id), done);
  }
  if (id && path.length === 3 && method === "POST") {
    if (sub === "code") return { data: await regenerateCode(db, userId, id) };
    if (sub === "leave") return (await leaveClass(db, userId, id), done);
  }
  if (id && sub === "progress" && path.length === 3 && method === "GET")
    return { data: await progressBoard(db, userId, id) };
  if (id && sub === "members" && memberOrSet && path.length === 4) {
    if (method === "DELETE") return (await removeMember(db, userId, id, memberOrSet), done);
    if (method === "PATCH")
      return (await setMemberRole(db, userId, id, memberOrSet, await body()), done);
  }
  if (id && sub === "sets" && memberOrSet && path.length === 4) {
    if (method === "PUT") return (await assignSet(db, userId, id, memberOrSet, await body()), done);
    if (method === "DELETE") return (await unassignSet(db, userId, id, memberOrSet), done);
  }
  throw new ApiError(404, "NOT_FOUND");
}

/** Personal folders: CRUD, membership and the merged study set. */
async function folderRoutes(db: Database, userId: string, request: Request, path: string[]) {
  const [domain, id, sub, setId] = path,
    method = request.method;
  if (domain === "sets" && id && sub === "folders" && path.length === 3 && method === "GET")
    return { data: await foldersOfSet(db, userId, id) };
  if (domain !== "folders") return null;
  if (!id) {
    if (method === "GET") return { data: await listFolders(db, userId) };
    if (method === "POST") return { data: await createFolder(db, userId, await readJson(request)) };
  }
  if (id && path.length === 2) {
    if (method === "GET") return { data: await getFolder(db, userId, id) };
    if (method === "PATCH") {
      await renameFolder(db, userId, id, await readJson(request));
      return { data: null };
    }
    if (method === "DELETE") {
      await deleteFolder(db, userId, id);
      return { data: null };
    }
  }
  if (id && sub === "study" && path.length === 3 && method === "GET")
    return { data: await folderStudySet(db, userId, id) };
  if (id && sub === "sets" && setId && path.length === 4) {
    if (method === "PUT") await addSetToFolder(db, userId, id, setId);
    else if (method === "DELETE") await removeSetFromFolder(db, userId, id, setId);
    else throw new ApiError(405, "NOT_FOUND");
    return { data: null };
  }
  throw new ApiError(404, "NOT_FOUND");
}

/** Sharing, reports, classes, folders and games, plus the admin API; null for other paths. */
export async function communityApi(db: Database, userId: string, request: Request, path: string[]) {
  const [domain, id, sub] = path,
    method = request.method;
  const folders = await folderRoutes(db, userId, request, path);
  if (folders) return folders;
  const klass = await classRoutes(db, userId, request, path);
  if (klass) return klass;
  const games = await gameRoutes(db, userId, request, path);
  if (games) return games;
  if (domain === "sets" && id && path.length === 3 && method !== "GET") {
    if (sub === "visibility" && method === "PATCH")
      return { data: await setVisibility(db, userId, id, await readJson(request)) };
    if (sub === "tags" && method === "PATCH")
      return { data: await setTags(db, userId, id, await readJson(request)) };
    if (sub === "moderation" && method === "POST") {
      await enforceLimit(`moderation:${userId}`, 10, 3600);
      return { data: await retryModeration(db, userId, id) };
    }
  }
  if (domain === "public" && id) {
    if (path.length === 2 && method === "GET") return { data: await getPublicSet(db, userId, id) };
    if (sub === "copy" && path.length === 3 && method === "POST")
      return { data: await copyPublicSet(db, userId, id) };
  }
  if (domain === "me" && id === "profile" && path.length === 2) {
    if (method === "GET") return { data: await getProfileSettings(db, userId) };
    if (method === "PATCH")
      return { data: await updateProfileSettings(db, userId, await readJson(request)) };
  }
  if (domain === "reports" && path.length === 1 && method === "POST") {
    await createReport(db, userId, await readJson(request));
    return { data: null };
  }
  return adminApi(db, userId, request, path);
}
