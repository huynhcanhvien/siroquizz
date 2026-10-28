import { z } from "zod";
import { cardInputSchema, cardSchema, setInputSchema } from "../schemas";

export { setAccessSchema, sharedInSchema } from "../schemas";

/** Card edits one change request may carry (shared by client and server). */
export const MAX_OPS_PER_REQUEST = 200;
const opCardSchema = cardInputSchema.omit({ id: true });
const cardIdSchema = z.string().min(1).max(64);

export const cardOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), card: opCardSchema }),
  z.object({ op: z.literal("edit"), cardId: cardIdSchema, card: opCardSchema }),
  z.object({ op: z.literal("delete"), cardId: cardIdSchema }),
]);
export type CardOp = z.input<typeof cardOpSchema>;

/** A proposal: optional new title/description plus card ops. Reordering is not proposable. */
export const changeOpsSchema = z
  .object({
    title: setInputSchema.shape.title.optional(),
    description: setInputSchema.shape.description.optional(),
    cards: z.array(cardOpSchema).max(MAX_OPS_PER_REQUEST),
  })
  .refine(
    (ops) => ops.cards.length > 0 || ops.title !== undefined || ops.description !== undefined,
    {
      error: "noChanges",
    },
  );
export type ChangeOps = z.input<typeof changeOpsSchema>;

export const personSchema = z.object({ id: z.string(), name: z.string(), avatarColor: z.string() });
export const changeRequestStatusSchema = z.enum(["pending", "approved", "rejected", "withdrawn"]);
export type ChangeRequestStatus = z.infer<typeof changeRequestStatusSchema>;

export const changeRequestSummarySchema = z.object({
  id: z.string(),
  setId: z.string(),
  classId: z.string().nullable(),
  status: changeRequestStatusSchema,
  note: z.string(),
  reviewNote: z.string(),
  opCount: z.number().int(),
  titleChanged: z.boolean(),
  author: personSchema,
  createdAt: z.string(),
  reviewedAt: z.string().nullable(),
  /** The set changed after the proposal was written. */
  stale: z.boolean(),
});
export type ChangeRequestSummary = z.infer<typeof changeRequestSummarySchema>;

const opCardOutSchema = z.object({
  term: z.string(),
  definition: z.string(),
  phonetic: z.string().optional(),
  example: z.string().optional(),
});
export const changeRequestDetailSchema = changeRequestSummarySchema.extend({
  title: z.string().optional(),
  description: z.string().optional(),
  cards: z.array(
    z.discriminatedUnion("op", [
      z.object({ op: z.literal("add"), card: opCardOutSchema }),
      z.object({
        op: z.literal("edit"),
        cardId: z.string(),
        before: cardSchema.nullable(),
        card: opCardOutSchema,
      }),
      z.object({ op: z.literal("delete"), cardId: z.string(), before: cardSchema.nullable() }),
    ]),
  ),
});
export type ChangeRequestDetail = z.infer<typeof changeRequestDetailSchema>;

export const pendingReviewItemSchema = z.object({
  id: z.string(),
  setId: z.string(),
  setTitle: z.string(),
  author: personSchema,
  opCount: z.number().int(),
  createdAt: z.string(),
  className: z.string().nullable(),
});
export type PendingReviewItem = z.infer<typeof pendingReviewItemSchema>;

const classRoleSchema = z.enum(["owner", "teacher", "student"]);
export const collaboratorCandidatesSchema = z.object({
  classes: z.array(
    z.object({
      classId: z.string(),
      className: z.string(),
      myRole: classRoleSchema,
      teachersGranted: z.boolean(),
      members: z.array(
        z.object({
          userId: z.string(),
          name: z.string(),
          avatarColor: z.string(),
          role: classRoleSchema,
          granted: z.boolean(),
        }),
      ),
    }),
  ),
});
export type CollaboratorCandidates = z.infer<typeof collaboratorCandidatesSchema>;
