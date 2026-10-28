import { z } from "zod";

export const folderSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  setCount: z.number().int(),
  updatedAt: z.string(),
});
export type FolderSummary = z.infer<typeof folderSummarySchema>;
export const folderDetailSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** False for a folder opened from a class library (read-only). */
  isOwner: z.boolean(),
  sets: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      cardCount: z.number().int(),
      termLang: z.string(),
      definitionLang: z.string(),
    }),
  ),
});
export type FolderDetail = z.infer<typeof folderDetailSchema>;
/** Maximum folder name length, matching the server. */
export const FOLDER_NAME_MAX = 60;
