import "server-only";
import { and, inArray, isNull, lt } from "drizzle-orm";
import type { Database } from "../db/client";
import { aiUploads, aiJobs, aiAuxUsage, aiResultCache, cardImages } from "../db/schema";
import { DELETE_BATCH_SIZE, deleteStoredObjects } from "./storage";

const DAY_MS = 86_400_000;
/** A replaced or detached card image survives a day before its object is deleted. */
export const ORPHAN_IMAGE_GRACE_MS = DAY_MS;

type StoredRow = { id: string; key: string };
/** Deletes the objects in one storage batch, then the rows whose object is really gone. */
async function removeStored(rows: StoredRow[], deleteRows: (ids: string[]) => Promise<unknown>) {
  const gone = new Set(await deleteStoredObjects(rows.map((row) => row.key)));
  const ids = rows.filter((row) => gone.has(row.key)).map((row) => row.id);
  if (ids.length) await deleteRows(ids);
  return ids.length;
}

async function cleanupExpiredUploads(db: Database, now: Date) {
  const expired = await db
    .select({ id: aiUploads.id, key: aiUploads.key })
    .from(aiUploads)
    .where(lt(aiUploads.expiresAt, now))
    .limit(DELETE_BATCH_SIZE);
  return removeStored(expired, (ids) => db.delete(aiUploads).where(inArray(aiUploads.id, ids)));
}

/**
 * Card images lose their card when replaced (`attachCardImage`) or when the card/set is deleted
 * (`on delete set null`); nothing else references them, so their objects would leak forever.
 */
export async function cleanupOrphanCardImages(db: Database, now = new Date()) {
  const orphans = await db
    .select({ id: cardImages.id, key: cardImages.key })
    .from(cardImages)
    .where(
      and(
        isNull(cardImages.cardId),
        lt(cardImages.createdAt, new Date(now.getTime() - ORPHAN_IMAGE_GRACE_MS)),
      ),
    )
    .limit(DELETE_BATCH_SIZE);
  return removeStored(orphans, (ids) =>
    db.delete(cardImages).where(and(inArray(cardImages.id, ids), isNull(cardImages.cardId))),
  );
}

export async function cleanupAi(db: Database, now = new Date()) {
  const removed = await cleanupExpiredUploads(db, now);
  await db.delete(aiJobs).where(lt(aiJobs.createdAt, new Date(now.getTime() - DAY_MS)));
  // Reused results stay free for a month, then the document has to be processed again.
  await db
    .delete(aiResultCache)
    .where(lt(aiResultCache.createdAt, new Date(now.getTime() - 30 * DAY_MS)));
  await db
    .delete(aiAuxUsage)
    .where(lt(aiAuxUsage.day, new Date(now.getTime() - DAY_MS).toISOString().slice(0, 10)));
  return removed;
}
