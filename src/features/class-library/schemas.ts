import { z } from "zod";

export const libraryAudienceSchema = z.enum(["teachers", "class"]);
export type LibraryAudience = z.infer<typeof libraryAudienceSchema>;
export const libraryItemTypeSchema = z.enum(["set", "folder"]);
export type LibraryItemType = z.infer<typeof libraryItemTypeSchema>;

export const classLibraryItemSchema = z.object({
  id: z.string(),
  itemType: libraryItemTypeSchema,
  itemId: z.string(),
  title: z.string(),
  cardCount: z.number().int().nullable(),
  setCount: z.number().int().nullable(),
  audience: libraryAudienceSchema,
  sharedAt: z.string(),
  sharedBy: z.object({ id: z.string(), name: z.string(), avatarColor: z.string() }),
  canRemove: z.boolean(),
});
export type ClassLibraryItem = z.infer<typeof classLibraryItemSchema>;
export const myClassLibraryItemSchema = classLibraryItemSchema.extend({
  classId: z.string(),
  className: z.string(),
});
export type MyClassLibraryItem = z.infer<typeof myClassLibraryItemSchema>;

/** One of the owner's classes and whether the item is shared there. */
export const itemShareSchema = z.object({
  classId: z.string(),
  className: z.string(),
  myRole: z.enum(["owner", "teacher", "student"]),
  libraryItemId: z.string().nullable(),
  audience: libraryAudienceSchema.nullable(),
});
export type ItemShare = z.infer<typeof itemShareSchema>;

/** Where a library item opens: sets on their page, folders on theirs. */
export const libraryItemHref = (item: { itemType: LibraryItemType; itemId: string }) =>
  item.itemType === "set" ? `/sets/${item.itemId}` : `/folders/${item.itemId}`;
