import { z } from "zod";

/** Rows per page on every admin list; one extra row is read to know if another page exists. */
export const ADMIN_PAGE_SIZE = 50;
/** Largest single manual credit adjustment, either way. */
export const MAX_CREDIT_ADJUSTMENT = 1000;
export const JOB_FILTERS = ["active", "awaiting", "done", "error", "cancelled"] as const;
export const SET_FILTERS = [
  "none",
  "pending",
  "approved",
  "flagged",
  "rejected",
  "hidden",
] as const;

// Query strings send "" for a cleared filter; treat it as absent.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
const cursor = optional(z.uuid());
const search = optional(z.string().trim().max(100));

export const userListQuery = z.object({ q: search, cursor });
export const jobListQuery = z.object({
  status: optional(z.enum(JOB_FILTERS)),
  userId: optional(z.uuid()),
  cursor,
});
export const setListQuery = z.object({ q: search, status: optional(z.enum(SET_FILTERS)), cursor });
export const auditListQuery = z.object({
  action: optional(z.string().regex(/^[a-z_]{1,40}$/)),
  actorId: optional(z.uuid()),
  targetId: optional(z.string().max(64)),
  cursor,
});

export const roleInput = z.object({ role: z.enum(["user", "admin"]) });
export const creditInput = z.object({
  delta: z
    .number()
    .int()
    .refine((delta) => delta !== 0 && Math.abs(delta) <= MAX_CREDIT_ADJUSTMENT),
  note: z.string().trim().min(1).max(200),
});

export const parseQuery = <T extends z.ZodType>(schema: T, params: URLSearchParams): z.infer<T> =>
  schema.parse(Object.fromEntries(params));

/** `%text%` for ILIKE, with the user's own wildcards taken literally. */
export const containsPattern = (text: string) => `%${text.replace(/[\\%_]/g, "\\$&")}%`;

/**
 * Turns `ADMIN_PAGE_SIZE + 1` rows, newest id first, into a page. Ids are UUID v7, so the last id
 * is a stable keyset cursor for the next page.
 */
export function toPage<T extends { id: string }>(rows: readonly T[]) {
  const items = rows.slice(0, ADMIN_PAGE_SIZE);
  return {
    items,
    nextCursor: rows.length > ADMIN_PAGE_SIZE ? (items.at(-1)?.id ?? null) : null,
  };
}
