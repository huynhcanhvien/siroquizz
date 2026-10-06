import "server-only";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "../../api-error";
import { ACTIVE_JOB_STATUSES } from "../../ai/credits";
import { stopJob } from "../../ai/jobs";
import type { Database } from "../../db/client";
import { aiJobs, user } from "../../db/schema";
import { audit } from "../moderation";
import { ADMIN_PAGE_SIZE, jobListQuery, parseQuery, toPage } from "./schemas";

/** AI jobs of every user, newest first; `active` covers every running stage. */
export async function listAllJobs(db: Database, params: URLSearchParams) {
  const { status, userId, cursor } = parseQuery(jobListQuery, params);
  const rows = await db
    .select({
      id: aiJobs.id,
      userId: aiJobs.userId,
      userName: user.name,
      userEmail: user.email,
      status: aiJobs.status,
      // Prompts are user text: show enough to recognise the job, not the whole thing.
      prompt: sql<string>`left(${aiJobs.prompt}, 120)`,
      model: aiJobs.model,
      inputTokens: aiJobs.inputTokens,
      outputTokens: aiJobs.outputTokens,
      creditsReserved: aiJobs.creditsReserved,
      creditsCharged: aiJobs.creditsCharged,
      errorCode: aiJobs.errorCode,
      createdAt: aiJobs.createdAt,
      finishedAt: aiJobs.finishedAt,
      heartbeatAt: aiJobs.heartbeatAt,
    })
    .from(aiJobs)
    .innerJoin(user, eq(user.id, aiJobs.userId))
    .where(
      and(
        status === "active"
          ? inArray(aiJobs.status, ACTIVE_JOB_STATUSES)
          : status
            ? eq(aiJobs.status, status)
            : undefined,
        userId ? eq(aiJobs.userId, userId) : undefined,
        cursor ? lt(aiJobs.id, cursor) : undefined,
      ),
    )
    .orderBy(desc(aiJobs.id))
    .limit(ADMIN_PAGE_SIZE + 1);
  return toPage(rows);
}

/**
 * Stops any user's open job, e.g. one stuck in the shared queue. The owner is charged for work
 * already done, exactly as if they had cancelled it. 404 when the job is missing or already over.
 */
export async function cancelAnyJob(db: Database, adminId: string, jobId: string) {
  const id = z.uuid().parse(jobId);
  const [job] = await db
    .select({ userId: aiJobs.userId })
    .from(aiJobs)
    .where(eq(aiJobs.id, id))
    .limit(1);
  if (
    !job ||
    !(await stopJob(db, job.userId, id, async (tx) => {
      await audit(tx, {
        actorId: adminId,
        action: "job_cancel",
        targetType: "job",
        targetId: id,
        meta: { userId: job.userId },
      });
    }))
  )
    throw new ApiError(404, "NOT_FOUND");
}
