import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getServerEnv } from "../env";
import * as schema from "./schema";

export function createDatabase(url: string) {
  // Serverless invocations are short-lived and run in parallel, so each instance keeps a tiny
  // pool and relies on the provider's connection pooler (e.g. Neon `-pooler`). `prepare: false`
  // is required for transaction-mode pooling.
  const connection = postgres(url, { max: 1, prepare: false });
  return { db: drizzle(connection, { schema }), connection };
}
export type Database = ReturnType<typeof createDatabase>["db"];
let instance: ReturnType<typeof createDatabase> | undefined;
export function getDatabase(): Database {
  const url = getServerEnv().DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return (instance ??= createDatabase(url)).db;
}
