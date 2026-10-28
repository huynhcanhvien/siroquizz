import { z } from "zod";
import { classRoleSchema } from "@/features/classes/schemas";
import { CONTENT_LANGUAGES } from "@/lib/types";
import { BASE64_PATTERN } from "./lib/base64";
import { MAX_PROMPT_CHARS, MAX_STATE_BYTES, MAX_TITLE_CHARS } from "./lib/limits";

export const sessionStatusSchema = z.enum(["draft", "open", "closed"]);
export const peerVisibilitySchema = z.enum(["hidden", "open"]);
export const audienceSchema = z.enum(["teachers", "class"]);
const base64 = z.string().max(200_000).regex(BASE64_PATTERN);
/** Server answers can carry a whole stored document (up to MAX_STATE_BYTES). */
const base64State = z
  .string()
  .max(Math.ceil((MAX_STATE_BYTES * 4) / 3) + 4)
  .regex(BASE64_PATTERN);
const isoDate = z.string().min(1);

export const sessionInputSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE_CHARS),
  prompt: z.string().max(MAX_PROMPT_CHARS).default(""),
});
export const sessionPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_TITLE_CHARS),
    prompt: z.string().max(MAX_PROMPT_CHARS),
    status: sessionStatusSchema,
    peerVisibility: peerVisibilitySchema,
    peerEditing: z.boolean(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0);
export type SessionPatch = z.infer<typeof sessionPatchSchema>;

export const docSummarySchema = z.object({
  id: z.uuid(),
  authorId: z.string(),
  version: z.number().int(),
  textPreview: z.string(),
  charCount: z.number().int(),
  lastEditorId: z.string().nullable(),
  updatedAt: isoDate,
});
export type DocSummary = z.infer<typeof docSummarySchema>;

export const sessionSummarySchema = z.object({
  id: z.uuid(),
  classId: z.uuid(),
  title: z.string(),
  status: sessionStatusSchema,
  peerVisibility: peerVisibilitySchema,
  peerEditing: z.boolean(),
  openedAt: isoDate.nullable(),
  closedAt: isoDate.nullable(),
  createdAt: isoDate,
  /** Null when the viewer may not list the session's documents. */
  docCount: z.number().int().nullable(),
  myDocId: z.uuid().nullable(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const sessionMemberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  avatarColor: z.string(),
  role: classRoleSchema,
});
export type SessionMember = z.infer<typeof sessionMemberSchema>;

export const sessionDetailSchema = sessionSummarySchema.extend({
  prompt: z.string(),
  className: z.string(),
  role: classRoleSchema,
  members: z.array(sessionMemberSchema),
  /** Everyone's documents, when the viewer may list them. */
  docs: z.array(docSummarySchema).nullable(),
});
export type SessionDetail = z.infer<typeof sessionDetailSchema>;

export const overviewSchema = z.object({
  serverTime: isoDate,
  docs: z.array(docSummarySchema),
});
export type Overview = z.infer<typeof overviewSchema>;

export const sessionGateSchema = z.object({
  status: sessionStatusSchema,
  peerVisibility: peerVisibilitySchema,
  peerEditing: z.boolean(),
});
export const docStateSchema = z.object({
  id: z.uuid(),
  sessionId: z.uuid(),
  authorId: z.string(),
  version: z.number().int(),
  state: base64State.nullable(),
  readOnly: z.boolean(),
});
export type DocState = z.infer<typeof docStateSchema>;

export const syncRequestSchema = z.object({
  sv: base64,
  update: base64.optional(),
  version: z.number().int().min(0).optional(),
});
export type SyncRequest = z.infer<typeof syncRequestSchema>;
export const syncResponseSchema = z.object({
  version: z.number().int(),
  update: base64State.optional(),
  readOnly: z.boolean(),
  session: sessionGateSchema,
});
export type SyncResponse = z.infer<typeof syncResponseSchema>;

const term = z.string().trim().min(1).max(1000);
export const scratchInputSchema = z.object({
  term,
  definition: z.string().trim().max(1000).default(""),
  phonetic: z.string().trim().max(200).nullable().optional(),
  example: z.string().trim().max(1000).nullable().optional(),
  sourceDocId: z.uuid().nullable().optional(),
});
export const scratchPatchSchema = z
  .object({
    term,
    definition: z.string().trim().max(1000),
    phonetic: z.string().trim().max(200).nullable(),
    example: z.string().trim().max(1000).nullable(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0);
export const scratchCardSchema = z.object({
  id: z.uuid(),
  term: z.string(),
  definition: z.string(),
  phonetic: z.string().nullable(),
  example: z.string().nullable(),
  sourceDocId: z.uuid().nullable(),
  createdAt: isoDate,
});
export type ScratchCard = z.infer<typeof scratchCardSchema>;

export const materializeSchema = z
  .object({
    ids: z.array(z.uuid()).min(2).max(500),
    title: z.string().trim().min(1).max(120),
    termLang: z.enum(CONTENT_LANGUAGES),
    definitionLang: z.enum(CONTENT_LANGUAGES),
    classId: z.uuid().optional(),
    audience: audienceSchema.default("class"),
  })
  .refine((input) => new Set(input.ids).size === input.ids.length);
export type MaterializeInput = z.input<typeof materializeSchema>;
