import "server-only";
import { lt, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { aiUploads, aiJobs, aiAuxUsage } from "../db/schema";
import { deleteUpload } from "./storage";
export async function cleanupAi(db: Database, now = new Date()) {
  const expired = await db.select().from(aiUploads).where(lt(aiUploads.expiresAt, now)).limit(500);
  for (const upload of expired) {
    await deleteUpload(upload.key);
    await db.delete(aiUploads).where(eq(aiUploads.id, upload.id));
  }
  await db.delete(aiJobs).where(lt(aiJobs.createdAt, new Date(now.getTime() - 86400_000)));
  await db
    .delete(aiAuxUsage)
    .where(lt(aiAuxUsage.day, new Date(now.getTime() - 86400_000).toISOString().slice(0, 10)));
  return expired.length;
}
