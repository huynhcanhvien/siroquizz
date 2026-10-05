import "server-only";
import { z } from "zod";
import type { Database } from "./db/client";
import { readJson } from "./api";
import {
  dueCards,
  reviewCard,
  getStars,
  setStar,
  getPreferences,
  savePreferences,
  startSession,
  finishSession,
  freezeStreak,
} from "./services/learning";
import { activityStats, statsOverview } from "./services/stats";
import { attachCardImage } from "./services/card-images";
export async function learningApi(db: Database, userId: string, request: Request, path: string[]) {
  const [domain, id, sub] = path,
    method = request.method,
    query = new URL(request.url).searchParams;
  if (domain === "reviews" && path.length === 1 && method === "POST")
    return { data: await reviewCard(db, userId, await readJson(request)) };
  if (domain === "reviews" && id === "due" && path.length === 2 && method === "GET")
    return {
      data: await dueCards(
        db,
        userId,
        z.coerce
          .number()
          .int()
          .min(1)
          .max(200)
          .default(200)
          .parse(query.get("limit") ?? undefined),
        new Date(),
        query.get("starred") === "1",
        query.get("folder") ?? undefined,
      ),
    };
  if (domain === "stats" && id === "overview" && path.length === 2 && method === "GET")
    return { data: await statsOverview(db, userId) };
  if (domain === "stats" && id === "activity" && path.length === 2 && method === "GET")
    return {
      data: await activityStats(
        db,
        userId,
        z.iso.date().parse(query.get("from")),
        z.iso.date().parse(query.get("to")),
      ),
    };
  if (domain === "stats" && id === "freeze" && path.length === 2 && method === "POST")
    return { data: await freezeStreak(db, userId) };
  if (domain === "me" && id === "preferences" && path.length === 2) {
    if (method === "GET") return { data: await getPreferences(db, userId) };
    if (method === "PATCH")
      return { data: await savePreferences(db, userId, await readJson(request)) };
  }
  if (domain === "sessions" && path.length === 1 && method === "POST")
    return { data: await startSession(db, userId, await readJson(request)) };
  if (domain === "sessions" && id && path.length === 2 && method === "PATCH")
    return { data: await finishSession(db, userId, id, await readJson(request)) };
  if (domain === "sets" && id && sub === "stars" && path.length === 3 && method === "GET")
    return { data: await getStars(db, userId, id) };
  if (
    domain === "cards" &&
    id &&
    sub === "star" &&
    path.length === 3 &&
    ["PUT", "DELETE"].includes(method)
  ) {
    await setStar(db, userId, id, method === "PUT");
    return { data: null };
  }
  if (domain === "cards" && id && sub === "image" && path.length === 3 && method === "POST")
    return { data: await attachCardImage(db, userId, id, await readJson(request), request.signal) };
}
