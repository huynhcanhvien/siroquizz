import { timingSafeEqual } from "node:crypto";
import { lt } from "drizzle-orm";
import { getDatabase } from "@/server/db/client";
import { user, studySets } from "@/server/db/schema";
import { cleanupAi } from "@/server/ai/cleanup";
import { moderatePending } from "@/server/services/moderation";
import { getServerEnv } from "@/server/env";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Removes 30-day-old account/set tombstones and expired AI uploads/jobs, and retries pending
 * moderation. Invoked by Vercel Cron.
 */
function authorized(request: Request) {
  const secret = getServerEnv().CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const received = Buffer.from(header);
  const want = Buffer.from(expected);
  return received.length === want.length && timingSafeEqual(received, want);
}

// Moderation may use what is left of the 60s limit after cleanup, minus a safety margin.
const MODERATION_DEADLINE_MS = 50_000;

async function handle(request: Request) {
  const startedAt = Date.now();
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const db = getDatabase();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await db.transaction(async (tx) => {
    await tx.delete(user).where(lt(user.deletedAt, cutoff));
    await tx.delete(studySets).where(lt(studySets.deletedAt, cutoff));
  });
  const removedUploads = await cleanupAi(db);
  // Public sets the moderation model could not check yet (it allows 2,000 tokens a minute).
  const moderated = (await moderatePending(db, 20, startedAt + MODERATION_DEADLINE_MS)).length;
  return Response.json(
    { success: true, data: { removedUploads, moderated } },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export { handle as GET, handle as POST };
