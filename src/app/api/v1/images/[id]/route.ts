import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, getSessionContext } from "@/server/api";
import { ApiError } from "@/server/api-error";
import { getDatabase } from "@/server/db/client";
import { cardImages, cards, studySets, user } from "@/server/db/schema";
import { canViewSet } from "@/server/services/access";
import { getUpload } from "@/server/ai/storage";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    z.uuid().parse(id);
    // Guests may load images of shared sets; everything else needs the owner's session.
    const viewerId = await getSessionContext(request.headers).then(
      (session) => session.user.id,
      () => null,
    );
    const db = getDatabase();
    const [row] = await db
      .select({ image: cardImages, set: studySets, ownerBannedAt: user.bannedAt })
      .from(cardImages)
      .innerJoin(cards, eq(cards.id, cardImages.cardId))
      .innerJoin(studySets, eq(studySets.id, cards.setId))
      .innerJoin(user, eq(user.id, studySets.ownerId))
      .where(eq(cardImages.id, id))
      .limit(1);
    if (!row || !canViewSet(viewerId, row.set, { ownerBanned: Boolean(row.ownerBannedAt) }))
      throw new ApiError(404, "NOT_FOUND");
    const { image } = row;
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
