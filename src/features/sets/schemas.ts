import { z } from "zod";
import { CONTENT_LANGUAGES, SET_SOURCES } from "@/lib/types";

/** Error messages are i18n keys under the `validation` namespace. */
export const SET_LIMITS = {
  minCards: 2,
  maxCards: 500,
  titleMax: 120,
  descriptionMax: 500,
  fieldMax: 1000,
  phoneticMax: 200,
} as const;

export const cardInputSchema = z.object({
  id: z.string().min(1).optional(),
  term: z
    .string()
    .trim()
    .min(1, { error: "cardTermRequired" })
    .max(SET_LIMITS.fieldMax, { error: "fieldTooLong" }),
  definition: z
    .string()
    .trim()
    .min(1, { error: "cardDefinitionRequired" })
    .max(SET_LIMITS.fieldMax, { error: "fieldTooLong" }),
  phonetic: z
    .string()
    .trim()
    .max(SET_LIMITS.phoneticMax, { error: "fieldTooLong" })
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export const setInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { error: "titleRequired" })
    .max(SET_LIMITS.titleMax, { error: "titleTooLong" }),
  description: z.string().trim().max(SET_LIMITS.descriptionMax, { error: "descriptionTooLong" }),
  termLang: z.enum(CONTENT_LANGUAGES),
  definitionLang: z.enum(CONTENT_LANGUAGES),
  source: z.enum(SET_SOURCES),
  cards: z
    .array(cardInputSchema)
    .min(SET_LIMITS.minCards, { error: "minCards" })
    .max(SET_LIMITS.maxCards, { error: "maxCards" }),
});
export type ValidSetInput = z.infer<typeof setInputSchema>;

export const cardSchema = z.object({
  id: z.string().min(1),
  term: z.string(),
  definition: z.string(),
  phonetic: z.string().optional(),
  imageUrl: z
    .string()
    .regex(/^\/api\/v1\/images\/[0-9a-f-]{36}$/)
    .optional(),
  imageAlt: z.string().max(1000).optional(),
});

export const setSharingSchema = z.object({
  visibility: z.enum(["private", "unlisted", "public"]),
  tags: z.array(z.string()).default([]),
  slug: z.string().nullable(),
  moderationStatus: z.enum(["none", "pending", "approved", "flagged", "rejected"]),
  moderationReason: z.string().nullable(),
  hidden: z.boolean(),
});
export const studySetSchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  title: z.string(),
  description: z.string(),
  termLang: z.enum(CONTENT_LANGUAGES),
  definitionLang: z.enum(CONTENT_LANGUAGES),
  cards: z.array(cardSchema),
  source: z.enum(SET_SOURCES),
  createdAt: z.string(),
  updatedAt: z.string(),
  sharing: setSharingSchema.optional(),
  copiedFrom: z
    .object({ title: z.string(), slug: z.string().nullable(), authorName: z.string() })
    .nullable()
    .optional(),
});

/** Editor rows that are completely empty are ignored, like Quizlet does. */
export function dropBlankRows<T extends { term: string; definition: string; phonetic?: string }>(
  rows: readonly T[],
): T[] {
  return rows.filter(
    (row) =>
      row.term.trim() !== "" || row.definition.trim() !== "" || (row.phonetic ?? "").trim() !== "",
  );
}

function isBlankRow(row: { term: string; definition: string; phonetic?: string }): boolean {
  return dropBlankRows([row]).length === 0;
}

/** Editor rows may be fully blank (ignored on save); partially filled rows must be complete. */
export const editorCardSchema = z
  .object({
    id: z.string().optional(),
    term: z.string(),
    definition: z.string(),
    phonetic: z.string(),
  })
  .superRefine((row, ctx) => {
    if (isBlankRow(row)) return;
    if (!row.term.trim())
      ctx.addIssue({ code: "custom", message: "cardTermRequired", path: ["term"] });
    if (!row.definition.trim()) {
      ctx.addIssue({ code: "custom", message: "cardDefinitionRequired", path: ["definition"] });
    }
    if (row.term.length > SET_LIMITS.fieldMax)
      ctx.addIssue({ code: "custom", message: "fieldTooLong", path: ["term"] });
    if (row.definition.length > SET_LIMITS.fieldMax) {
      ctx.addIssue({ code: "custom", message: "fieldTooLong", path: ["definition"] });
    }
    if (row.phonetic.length > SET_LIMITS.phoneticMax) {
      ctx.addIssue({ code: "custom", message: "fieldTooLong", path: ["phonetic"] });
    }
  });

export const editorSchema = setInputSchema.omit({ cards: true, source: true }).extend({
  cards: z
    .array(editorCardSchema)
    .refine((rows) => dropBlankRows(rows).length >= SET_LIMITS.minCards, { error: "minCards" })
    .refine((rows) => dropBlankRows(rows).length <= SET_LIMITS.maxCards, { error: "maxCards" }),
});
export type EditorValues = z.input<typeof editorSchema>;
