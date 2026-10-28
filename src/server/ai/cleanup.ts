import "server-only";
import { lt, inArray } from "drizzle-orm";
import type { Database } from "../db/client";
import { aiUploads, aiJobs, aiAuxUsage, aiResultCache } from "../db/schema";
import { DELETE_BATCH_SIZE, deleteStoredObjects } from "./storage";

/** Removes up to one S3 batch of expired uploads: one DeleteObjects call, one row delete. */
async function cleanupExpiredUploads(db: Database, now: Date) {
  const expired = await db
    .select({ id: aiUploads.id, key: aiUploads.key })
    .from(aiUploads)
    .where(lt(aiUploads.expiresAt, now))
    .limit(DELETE_BATCH_SIZE);
  const gone = new Set(await deleteStoredObjects(expired.map((upload) => upload.key)));
  const ids = expired.filter((upload) => gone.has(upload.key)).map((upload) => upload.id);
  if (ids.length) await db.delete(aiUploads).where(inArray(aiUploads.id, ids));
  return ids.length;
}

export async function cleanupAi(db: Database, now = new Date()) {
  const removed = await cleanupExpiredUploads(db, now);
  await db.delete(aiJobs).where(lt(aiJobs.createdAt, new Date(now.getTime() - 86400_000)));
  // Reused results stay free for a month, then the document has to be processed again.
  await db
    .delete(aiResultCache)
    .where(lt(aiResultCache.createdAt, new Date(now.getTime() - 30 * 86400_000)));
  await db
    .delete(aiAuxUsage)
    .where(lt(aiAuxUsage.day, new Date(now.getTime() - 86400_000).toISOString().slice(0, 10)));
  return removed;
}
