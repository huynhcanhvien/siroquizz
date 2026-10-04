import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { lt } from "drizzle-orm";
import { cleanupAi } from "../src/server/ai/cleanup";
import { user, studySets } from "../src/server/db/schema";
import * as schema from "../src/server/db/schema";
async function main() {
  loadEnvConfig(process.cwd());
  const connection = postgres(process.env.DATABASE_URL!);
  const db = drizzle(connection, { schema });
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  try {
    await db.transaction(async (tx) => {
      await tx.delete(user).where(lt(user.deletedAt, cutoff));
      await tx.delete(studySets).where(lt(studySets.deletedAt, cutoff));
    });
    await cleanupAi(db);
    console.log("Removed account and set tombstones older than 30 days.");
  } finally {
    await connection.end();
  }
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Script failed");
  process.exitCode = 1;
});
