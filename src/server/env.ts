import "server-only";
import { parseServerEnv, type ServerEnv } from "./env-schema";

let cached: ServerEnv | undefined;

/** Lazy validation keeps builds independent of deployment credentials. */
export function getServerEnv(): ServerEnv {
  return (cached ??= parseServerEnv(process.env));
}
