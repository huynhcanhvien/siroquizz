import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { user } from "../src/server/db/schema";

/**
 * Makes an existing account a moderator: `DATABASE_URL=... pnpm admin:grant someone@example.com`.
 * Pass `--revoke` to remove the role. DATABASE_URL must be given explicitly so the target
 * database is never picked up from an env file by accident.
 */
async function main() {
  const [email, flag] = process.argv.slice(2);
  const url = process.env.DATABASE_URL;
  if (!email || !url) {
    console.error("Usage: DATABASE_URL=<url> pnpm admin:grant <email> [--revoke]");
    process.exitCode = 1;
    return;
  }
  const connection = postgres(url, { max: 1 });
  try {
    const [row] = await drizzle(connection)
      .update(user)
      .set({ role: flag === "--revoke" ? "user" : "admin", updatedAt: new Date() })
      .where(eq(user.email, email.toLowerCase()))
      .returning({ id: user.id, role: user.role });
    console.log(row ? `${email} is now ${row.role}.` : `No account with email ${email}.`);
    if (!row) process.exitCode = 1;
  } finally {
    await connection.end();
  }
}
void main();
