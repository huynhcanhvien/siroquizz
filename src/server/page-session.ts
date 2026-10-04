import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getSessionContext } from "./api";
import { ApiError } from "./api-error";
import { getDatabase } from "./db/client";
import { getServerEnv } from "./env";
import { ensureSampleSets } from "./services/seed";
import { safeNextPath } from "@/lib/safe-redirect";
import type { User } from "@/lib/types";

/**
 * Server-side session for app pages. Returns the user so layouts can hand it to the client
 * (no second `/me` round trip before first paint). Deduplicated per request via `cache`.
 */
export const requirePageSession = cache(async (): Promise<User | null> => {
  if (getServerEnv().NEXT_PUBLIC_DATA_SOURCE !== "http") return null;
  const requestHeaders = await headers();
  try {
    const session = await getSessionContext(requestHeaders);
    // First visit after sign-up: seed here so the first page render already shows samples.
    if (!session.samplesSeeded)
      await ensureSampleSets(getDatabase(), session.user.id, session.user.uiLocale);
    return session.user;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const next = safeNextPath(requestHeaders.get("x-siro-path"));
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
});
