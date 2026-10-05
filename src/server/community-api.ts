import "server-only";
import { z } from "zod";
import type { Database } from "./db/client";
import { readJson } from "./api";
import { ApiError } from "./api-error";
import { enforceLimit } from "./rate-limit";
import { requireAdmin } from "./services/access";
import { applySetAction, moderationQueue } from "./services/moderation";
import { createReport, listOpenReports, resolveReport, setBanned } from "./services/reports";
import {
  copyPublicSet,
  getPublicSet,
  retryModeration,
  setTags,
  setVisibility,
} from "./services/sharing";
import { getProfileSettings, updateProfileSettings } from "./services/profiles";

const SET_ACTIONS = ["approve", "reject", "hide", "restore"] as const;

/** Sharing, reports and moderation endpoints; returns null when the path is not one of them. */
export async function communityApi(db: Database, userId: string, request: Request, path: string[]) {
  const [domain, id, sub, action] = path,
    method = request.method;
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
  if (domain !== "admin") return null;
  await requireAdmin(db, userId);
  if (id === "reports" && path.length === 2 && method === "GET")
    return { data: await listOpenReports(db) };
  if (id === "reports" && sub && action === "resolve" && path.length === 4 && method === "POST") {
    await resolveReport(db, userId, sub, await readJson(request));
    return { data: null };
  }
  if (id === "moderation" && path.length === 2 && method === "GET")
    return {
      data: (await moderationQueue(db)).map((row) => ({
        ...row,
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  if (id === "sets" && sub && path.length === 4 && method === "POST") {
    const setAction = z.enum(SET_ACTIONS).parse(action);
    const { reason } = z
      .object({ reason: z.string().trim().max(200).default("") })
      .parse(await readJson(request));
    await applySetAction(db, userId, z.uuid().parse(sub), setAction, reason);
    return { data: null };
  }
  if (id === "users" && sub && path.length === 4 && method === "POST") {
    if (action !== "ban" && action !== "unban") throw new ApiError(404, "NOT_FOUND");
    await setBanned(db, userId, sub, action === "ban");
    return { data: null };
  }
  throw new ApiError(404, "NOT_FOUND");
}
