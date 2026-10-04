import "server-only";
import { eq } from "drizzle-orm";
import { buildSampleSets } from "@/features/sets/seed";
import vi from "../../../messages/vi.json";
import en from "../../../messages/en.json";
import zh from "../../../messages/zh.json";
import type { Database } from "../db/client";
import { user } from "../db/schema";
import { createSetInTransaction } from "./sets";

export async function ensureSampleSets(db: Database, ownerId: string, locale: string) {
  await db.transaction(async (tx) => {
    const [owner] = await tx.select().from(user).where(eq(user.id, ownerId)).limit(1).for("update");
    if (!owner || owner.deletedAt || owner.samplesSeeded) return;
    const messages = locale === "en" ? en : locale === "zh" ? zh : vi;
    for (const input of buildSampleSets(messages.seed))
      await createSetInTransaction(tx, ownerId, input);
    await tx.update(user).set({ samplesSeeded: true }).where(eq(user.id, ownerId));
  });
}
