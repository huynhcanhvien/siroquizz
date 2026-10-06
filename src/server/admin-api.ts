import "server-only";
import { z } from "zod";
import type { Database } from "./db/client";
import { readJson } from "./api";
import { ApiError } from "./api-error";
import { enforceLimit } from "./rate-limit";
import { requireAdmin } from "./services/access";
import { applySetAction, moderationQueue } from "./services/moderation";
import { listOpenReports, resolveReport, setBanned } from "./services/reports";
import { listAudit } from "./services/admin/audit";
import { adjustCredits } from "./services/admin/credits";
import { cancelAnyJob, listAllJobs } from "./services/admin/jobs";
import { adminOverview } from "./services/admin/overview";
import { listAdminSets, setHistory } from "./services/admin/sets";
import { getUserDetail, listUsers, setRole } from "./services/admin/users";

const SET_ACTIONS = ["approve", "reject", "hide", "restore"] as const;
/** Admin writes allowed per admin per hour; generous for real work, a brake on a stolen session. */
const ADMIN_WRITES_PER_HOUR = 300;
const done = { data: null };

type Route = Promise<{ data: unknown } | null>;

async function moderationRoutes(db: Database, adminId: string, request: Request, path: string[]) {
  const [, id, sub, action] = path,
    method = request.method;
  if (id === "reports" && path.length === 2 && method === "GET")
    return { data: await listOpenReports(db) };
  if (id === "reports" && sub && action === "resolve" && path.length === 4 && method === "POST") {
    await resolveReport(db, adminId, sub, await readJson(request));
    return done;
  }
  if (id === "moderation" && path.length === 2 && method === "GET")
    return { data: await moderationQueue(db) };
  return null;
}

async function userRoutes(db: Database, adminId: string, request: Request, path: string[]): Route {
  const [, id, sub, action] = path,
    method = request.method;
  if (id !== "users") return null;
  if (path.length === 2 && method === "GET")
    return { data: await listUsers(db, new URL(request.url).searchParams) };
  if (!sub) return null;
  if (path.length === 3 && method === "GET") return { data: await getUserDetail(db, sub) };
  if (path.length !== 4) return null;
  if ((action === "ban" || action === "unban") && method === "POST") {
    await setBanned(db, adminId, z.uuid().parse(sub), action === "ban");
    return done;
  }
  if (action === "role" && method === "PATCH") {
    await setRole(db, adminId, sub, await readJson(request));
    return done;
  }
  if (action === "credits" && method === "POST")
    return { data: await adjustCredits(db, adminId, sub, await readJson(request)) };
  return null;
}

async function contentRoutes(
  db: Database,
  adminId: string,
  request: Request,
  path: string[],
): Route {
  const [, id, sub, action] = path,
    method = request.method;
  const params = new URL(request.url).searchParams;
  if (id === "overview" && path.length === 2 && method === "GET")
    return { data: await adminOverview(db) };
  if (id === "audit" && path.length === 2 && method === "GET")
    return { data: await listAudit(db, params) };
  if (id === "jobs" && path.length === 2 && method === "GET")
    return { data: await listAllJobs(db, params) };
  if (id === "jobs" && sub && action === "cancel" && path.length === 4 && method === "POST") {
    await cancelAnyJob(db, adminId, sub);
    return done;
  }
  if (id !== "sets") return null;
  if (path.length === 2 && method === "GET") return { data: await listAdminSets(db, params) };
  if (sub && action === "history" && path.length === 4 && method === "GET")
    return { data: await setHistory(db, sub) };
  if (sub && path.length === 4 && method === "POST") {
    const setAction = z.enum(SET_ACTIONS).parse(action);
    const { reason } = z
      .object({ reason: z.string().trim().max(200).default("") })
      .parse(await readJson(request));
    await applySetAction(db, adminId, z.uuid().parse(sub), setAction, reason);
    return done;
  }
  return null;
}

/**
 * Every `/api/v1/admin/*` endpoint; returns null for other paths. The admin role is checked in the
 * database before any route runs, so a demoted or locked admin loses access immediately.
 */
export async function adminApi(db: Database, userId: string, request: Request, path: string[]) {
  if (path[0] !== "admin") return null;
  await requireAdmin(db, userId);
  if (request.method !== "GET") await enforceLimit(`admin:${userId}`, ADMIN_WRITES_PER_HOUR, 3600);
  const result =
    (await moderationRoutes(db, userId, request, path)) ??
    (await userRoutes(db, userId, request, path)) ??
    (await contentRoutes(db, userId, request, path));
  if (!result) throw new ApiError(404, "NOT_FOUND");
  return result;
}
