import { z } from "zod";
const date = z.string();
export const jobStatusSchema = z.enum([
  "queued",
  "extracting",
  "generating",
  "validating",
  "awaiting",
  "done",
  "error",
  "cancelled",
]);
export const setStatusSchema = z.enum(["none", "pending", "approved", "flagged", "rejected"]);
export const userSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  username: z.string().nullable(),
  role: z.string(),
  emailVerified: z.boolean(),
  bannedAt: date.nullable(),
  deletedAt: date.nullable(),
  createdAt: date,
});
export const jobSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  userName: z.string(),
  userEmail: z.string(),
  status: jobStatusSchema,
  prompt: z.string(),
  model: z.string().nullable(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  creditsReserved: z.number(),
  creditsCharged: z.number(),
  errorCode: z.string().nullable(),
  createdAt: date,
  finishedAt: date.nullable(),
  heartbeatAt: date.nullable(),
});
export const setSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  slug: z.string().nullable(),
  visibility: z.string(),
  moderationStatus: setStatusSchema,
  moderationReason: z.string().nullable(),
  hiddenAt: date.nullable(),
  cardCount: z.number(),
  ownerId: z.uuid(),
  ownerName: z.string(),
  createdAt: date,
});
export const auditSchema = z.object({
  id: z.uuid(),
  action: z.string(),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  targetType: z.string(),
  targetId: z.string(),
  meta: z.unknown(),
  createdAt: date,
});
export const historySchema = auditSchema.omit({ targetType: true, targetId: true });
export const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({ items: item.array(), nextCursor: z.string().nullable() });
export const creditSchema = z.object({
  dailyLimit: z.number(),
  dailyUsed: z.number(),
  dailyRemaining: z.number(),
  earned: z.number(),
  reserved: z.number(),
  available: z.number(),
  resetsAt: date,
});
export const detailSchema = z.object({
  user: userSchema,
  credits: creditSchema,
  openReports: z.number(),
  jobs: z
    .object({
      id: z.uuid(),
      status: jobStatusSchema,
      prompt: z.string(),
      creditsCharged: z.number(),
      errorCode: z.string().nullable(),
      createdAt: date,
    })
    .array(),
  sets: z
    .object({
      id: z.uuid(),
      title: z.string(),
      slug: z.string().nullable(),
      visibility: z.string(),
      moderationStatus: setStatusSchema,
      hiddenAt: date.nullable(),
      cardCount: z.number(),
      updatedAt: date,
    })
    .array(),
  ledger: z
    .object({ id: z.uuid(), delta: z.number(), reason: z.string(), createdAt: date })
    .array(),
});
export const overviewSchema = z.object({
  users: z.object({
    total: z.number(),
    newThisWeek: z.number(),
    banned: z.number(),
    admins: z.number(),
  }),
  sets: z.object({ public: z.number(), awaitingReview: z.number(), hidden: z.number() }),
  jobs: z.object({
    today: z.number(),
    failed: z.number(),
    creditsCharged: z.number(),
    running: z.number(),
  }),
  openReports: z.number(),
  tokens: z.object({ used: z.number(), limit: z.number() }),
});
