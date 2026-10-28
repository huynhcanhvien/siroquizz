import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { v7 } from "uuid";
import { z } from "zod";
import sharp from "sharp";
import type { Database } from "../db/client";
import { ApiError } from "../api-error";
import { aiUploads, cardImages } from "../db/schema";
import { getUpload, putStoredFile, deleteUpload } from "../ai/storage";
import { validateMagic } from "../ai/extract";
import {requireOwnedSet} from "./sets";
import { markEdited } from "./sharing";
import { requireCard } from "./learning";
export async function attachCardImage(
  db: Database,
  userId: string,
  cardId: string,
  input: unknown,
  signal: AbortSignal,
) {
  const data = z
      .object({ uploadId: z.uuid(), alt: z.string().trim().max(1000).default("") })
      .parse(input),
    card = await requireCard(db, userId, cardId);
  // Only the owner adds images; check before doing any work on the upload.
  await requireOwnedSet(db, userId, card.setId);
  const [upload] = await db
    .select()
    .from(aiUploads)
    .where(
      and(
        eq(aiUploads.id, data.uploadId),
        eq(aiUploads.userId, userId),
        gt(aiUploads.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!upload) throw new ApiError(404, "NOT_FOUND");
  if (upload.size > 5 * 1024 * 1024 || !upload.mime.startsWith("image/"))
    throw new ApiError(400, "INVALID_FILE");
  const bytes = await getUpload(upload.key, upload.size, signal);
  validateMagic(bytes, upload.name, upload.mime);
  const image = await sharp(bytes, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const id = v7(),
    key = `uploads/${id}`,
    alt = data.alt || card.definition;
  await putStoredFile(key, image, "image/webp", signal);
  try {
    await db.transaction(async (tx) => {
      await requireOwnedSet(tx, userId, card.setId, "update");
      await requireCard(tx, userId, cardId);
      await tx.update(cardImages).set({ cardId: null }).where(eq(cardImages.cardId, cardId));
      await tx.insert(cardImages).values({ id, key, userId, cardId, alt, size: image.length });
    });
  } catch (error) {
    await deleteUpload(key);
    throw error;
  }
  // An image is content too: a shared set needs a fresh moderation verdict.
  await markEdited(db, card.setId);
  return { imageUrl: `/api/v1/images/${id}`, imageAlt: alt };
}
