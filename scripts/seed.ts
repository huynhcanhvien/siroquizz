import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { v7 } from "uuid";
import { buildSampleSets } from "../src/features/sets/seed";
import { cards, studySets, user } from "../src/server/db/schema";
import vi from "../messages/vi.json";

async function main() {
  loadEnvConfig(process.cwd());
  const connection = postgres(process.env.DATABASE_URL!);
  const db = drizzle(connection);
  const email = process.argv[2];
  if (!email)
    throw new Error("Usage: pnpm db:seed user@example.com (create and verify this account first)");
  try {
    const [owner] = await db.select().from(user).where(eq(user.email, email)).limit(1);
    if (!owner || owner.deletedAt) throw new Error("Active account not found");
    const samples = buildSampleSets(vi.seed);
    await db.transaction(async (tx) => {
      for (const sample of samples) {
        const id = v7();
        await tx
          .insert(studySets)
          .values({ ...sample, id, ownerId: owner.id, cardCount: sample.cards.length });
        await tx
          .insert(cards)
          .values(sample.cards.map((c, position) => ({ ...c, id: v7(), setId: id, position })));
      }
    });
    console.log("Seeded 3 sample sets.");
  } finally {
    await connection.end();
  }
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Script failed");
  process.exitCode = 1;
});
