import { createHttpClient } from "@/lib/http-client";
import { jobSummarySchema } from "../schemas";

const client = createHttpClient();

/** Where the generator lives; the background indicator stays out of the way there. */
export const AI_PAGE = "/sets/new/ai";

/** The signed-in person's generations from the last 24 hours, newest first. */
export const aiJobsQuery = {
  queryKey: ["ai-jobs"],
  queryFn: async () => (await client.request("/api/v1/ai/jobs", jobSummarySchema.array())).data,
};

/** Statuses of a job that is not finished yet and can be picked up again. */
export const OPEN_JOB_STATUSES = new Set([
  "awaiting",
  "queued",
  "extracting",
  "generating",
  "validating",
]);
