import { and, eq, gt } from "drizzle-orm";
import { v7 } from "uuid";
import { z } from "zod";
import { api, readJson } from "@/server/api";
import { ApiError } from "@/server/api-error";
import { getDatabase } from "@/server/db/client";
import { aiUploads } from "@/server/db/schema";
import { cancelJob, confirmJob, createJob, getQuota, listJobs, stepJob } from "@/server/ai/jobs";
import {
  MAX_UPLOAD_BYTES,
  presignUpload,
  putLocalFile,
  readBinary,
  verifyUploadSignature,
} from "@/server/ai/storage";
import { validateMagic } from "@/server/ai/extract";
import { auxiliaryTask } from "@/server/ai/auxiliary";
import { enforceLimit } from "@/server/rate-limit";
export const runtime = "nodejs";
// Each request advances a job by one bounded slice; stays under the free-plan 60s function limit.
export const maxDuration = 60;
type Context = { params: Promise<{ path: string[] }> };
const uploadSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[^/\\\u0000-\u001f]+\.(pdf|docx|txt|md|csv|png|jpg|jpeg|webp)$/i),
  size: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  mime: z.enum([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
    "text/x-markdown",
    "text/csv",
    "application/vnd.ms-excel",
    "image/png",
    "image/jpeg",
    "image/webp",
  ]),
});
async function handle(request: Request, context: Context) {
  const { path } = await context.params;
  const [domain, id, sub] = path;
  const db = getDatabase();
  return api(request, async (current) => {
    if (domain === "quota" && path.length === 1 && request.method === "GET")
      return { data: await getQuota(db, current.id) };
    if (domain === "uploads" && path.length === 1 && request.method === "POST") {
      await enforceLimit(`ai-upload:${current.id}`, 25, 3600);
      const data = uploadSchema.parse(await readJson(request));
      const uploadId = v7(),
        key = `uploads/${uploadId}`;
      const url = await presignUpload(uploadId, key, data.size, data.mime);
      await db.insert(aiUploads).values({
        id: uploadId,
        userId: current.id,
        key,
        ...data,
        expiresAt: new Date(Date.now() + 86400_000),
      });
      return { data: { uploadId, url, mime: data.mime } };
    }
    if (
      domain === "uploads" &&
      id &&
      sub === "file" &&
      path.length === 3 &&
      request.method === "PUT"
    ) {
      z.uuid().parse(id);
      const [upload] = await db
        .select()
        .from(aiUploads)
        .where(
          and(
            eq(aiUploads.id, id),
            eq(aiUploads.userId, current.id),
            gt(aiUploads.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (!upload) throw new ApiError(404, "NOT_FOUND");
      verifyUploadSignature(id, upload.size, upload.mime, new URL(request.url).searchParams);
      if (request.headers.get("content-type") !== upload.mime)
        throw new ApiError(400, "INVALID_FILE");
      const bytes = await readBinary(request, upload.size);
      validateMagic(bytes, upload.name, upload.mime);
      await putLocalFile(upload.key, bytes);
      return { data: null };
    }
    if (domain === "jobs" && path.length === 1) {
      if (request.method === "POST")
        return { data: await createJob(db, current.id, await readJson(request)) };
      if (request.method === "GET")
        return {
          data: await listJobs(
            db,
            current.id,
            z.coerce
              .number()
              .int()
              .min(1)
              .max(50)
              .default(10)
              .parse(new URL(request.url).searchParams.get("limit") ?? undefined),
          ),
        };
    }
    if (domain === "jobs" && id && sub === "step" && path.length === 3 && request.method === "POST") {
      await enforceLimit(`ai-step:${current.id}`, 300, 60);
      return { data: await stepJob(db, current.id, id, request.signal) };
    }
    if (
      domain === "jobs" &&
      id &&
      sub === "confirm" &&
      path.length === 3 &&
      request.method === "POST"
    ) {
      await confirmJob(db, current.id, id, await readJson(request));
      return { data: null };
    }
    if (
      domain === "jobs" &&
      id &&
      sub === "cancel" &&
      path.length === 3 &&
      request.method === "POST"
    ) {
      await cancelJob(db, current.id, id);
      return { data: null };
    }
    if (
      ["phonetics", "examples", "grade"].includes(domain) &&
      path.length === 1 &&
      request.method === "POST"
    )
      return {
        data: await auxiliaryTask(db, current.id, domain, await readJson(request), request.signal),
      };
    throw new ApiError(404, "NOT_FOUND");
  });
}
export { handle as GET, handle as POST, handle as PUT };
