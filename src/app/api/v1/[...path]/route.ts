import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { profileUpdateSchema } from "@/features/auth/schemas";
import { learningApi } from "@/server/learning-api";
import { communityApi } from "@/server/community-api";
import { api, readJson, type ApiContext } from "@/server/api";
import type { User } from "@/lib/types";
import { ApiError } from "@/server/api-error";
import { getDatabase } from "@/server/db/client";
import { account, session as sessionTable, user } from "@/server/db/schema";
import {
  createSetInTransaction,
  duplicateSet,
  getSet,
  listSets,
  removeSet,
  updateSet,
} from "@/server/services/sets";
import {
  correctTest,
  getProgress,
  listHistory,
  putProgress,
  recentActivity,
  recordActivity,
  resetProgress,
  saveGame,
  saveTest,
} from "@/server/services/progress";
import { importLocal } from "@/server/services/import-local";
import { ensureSampleSets } from "@/server/services/seed";
import { writePolicy } from "@/server/write-policy";

export const runtime = "nodejs";
type Context = { params: Promise<{ path: string[] }> };
async function handle(request: Request, context: Context) {
  const { path } = await context.params;
  const action = async (current: User, session: ApiContext) => {
    const [domain, id, sub] = path;
    const method = request.method;
    const db = getDatabase();
    const query = new URL(request.url).searchParams;
    const body = () => readJson(request);
    const learning = await learningApi(db, current.id, request, path);
    if (learning) return learning;
    const community = await communityApi(db, current.id, request, path);
    if (community) return community;
    if (domain === "me" && path.length === 1) {
      if (method === "GET") {
        if (!session.samplesSeeded) {
          await ensureSampleSets(db, current.id, current.uiLocale);
          session.refreshSession();
        }
        return { data: current };
      }
      if (method === "PATCH") {
        const update = profileUpdateSchema.parse(await body());
        const [row] = await db
          .update(user)
          .set({
            ...(update.displayName ? { name: update.displayName } : {}),
            ...(update.avatarColor ? { avatarColor: update.avatarColor } : {}),
            ...(update.uiLocale ? { uiLocale: update.uiLocale } : {}),
            updatedAt: new Date(),
          })
          .where(eq(user.id, current.id))
          .returning();
        session.refreshSession();
        return {
          data: {
            ...current,
            displayName: row.name,
            avatarColor: row.avatarColor,
            uiLocale: row.uiLocale,
          },
        };
      }
      if (method === "DELETE") {
        // A recent authenticated password confirmation is required below.
        const { password } = z
          .object({ password: z.string().max(128).default("") })
          .parse(await body());
        const { getAuth } = await import("@/server/auth");
        const [credential] = await db
          .select({ id: account.id })
          .from(account)
          .where(and(eq(account.userId, current.id), eq(account.providerId, "credential")))
          .limit(1);
        if (credential || password) {
          if (!password) throw new ApiError(400, "INVALID_CREDENTIALS");
          try {
            await getAuth().api.verifyPassword({ headers: request.headers, body: { password } });
          } catch {
            throw new ApiError(400, "INVALID_CREDENTIALS");
          }
        } else {
          const active = await getAuth().api.getSession({ headers: request.headers });
          if (!active || Date.now() - active.session.createdAt.getTime() > 5 * 60 * 1000)
            throw new ApiError(403, "FORBIDDEN");
        }
        await db.transaction(async (tx) => {
          await tx
            .update(user)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(eq(user.id, current.id));
          await tx.delete(sessionTable).where(eq(sessionTable.userId, current.id));
        });
        session.refreshSession();
        return { data: null };
      }
    }
    if (domain === "activity" && path.length === 1 && method === "GET")
      return { data: await recentActivity(db, current.id, query) };
    if (domain === "import" && id === "local" && path.length === 2 && method === "POST")
      return { data: await importLocal(db, current.id, await body()) };
    if (domain === "test-results" && id && path.length === 2 && method === "PATCH")
      return { data: await correctTest(db, current.id, id, await body()) };
    if (domain !== "sets" || path.length > 3) throw new ApiError(404, "NOT_FOUND");
    if (!id) {
      if (method === "GET") return listSets(db, current.id, query);
      if (method === "POST") {
        const input = await body();
        return {
          data: await db.transaction((tx) => createSetInTransaction(tx, current.id, input)),
        };
      }
    }
    if (id && !sub) {
      if (method === "GET") return { data: await getSet(db, current.id, id) };
      if (method === "PUT") return { data: await updateSet(db, current.id, id, await body()) };
      if (method === "DELETE") {
        await removeSet(db, current.id, id);
        return { data: null };
      }
    }
    if (id && sub === "duplicate" && method === "POST") {
      const { title } = z.object({ title: z.string().min(1).max(120) }).parse(await body());
      return { data: await duplicateSet(db, current.id, id, title) };
    }
    if (id && sub === "progress") {
      if (method === "GET") return { data: await getProgress(db, current.id, id) };
      if (method === "PUT") return { data: await putProgress(db, current.id, id, await body()) };
      if (method === "DELETE") {
        await resetProgress(db, current.id, id);
        return { data: null };
      }
    }
    if (id && sub === "test-results") {
      if (method === "GET") return listHistory(db, current.id, id, "test", query);
      if (method === "POST") return { data: await saveTest(db, current.id, id, await body()) };
    }
    if (id && sub === "game-scores") {
      if (method === "GET") return listHistory(db, current.id, id, "game", query);
      if (method === "POST") return { data: await saveGame(db, current.id, id, await body()) };
    }
    if (id && sub === "activity" && method === "POST") {
      await recordActivity(db, current.id, id);
      return { data: null };
    }
    throw new ApiError(405, "NOT_FOUND");
  };
  return api(request, action, { writeLimit: writePolicy(path) });
}
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
