import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, requireSession } from "@/server/api";
import { ApiError } from "@/server/api-error";
import { getDatabase } from "@/server/db/client";
import { cardImages } from "@/server/db/schema";
import { requireCard } from "@/server/services/learning";
import { getUpload } from "@/server/ai/storage";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireSession(request),
      { id } = await context.params;
    z.uuid().parse(id);
    const db = getDatabase();
    const [image] = await db.select().from(cardImages).where(eq(cardImages.id, id)).limit(1);
    if (!image?.cardId) throw new ApiError(404, "NOT_FOUND");
    await requireCard(db, current.id, image.cardId);
    return new Response(new Uint8Array(await getUpload(image.key, image.size, request.signal)), {
      headers: {
        "Content-Type": "image/webp",
        // Each upload gets a fresh id, so the bytes behind a URL never change.
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
