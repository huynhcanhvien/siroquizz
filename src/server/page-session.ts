import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireSession } from "./api";
import { ApiError } from "./api-error";
import { getServerEnv } from "./env";
import { safeNextPath } from "@/lib/safe-redirect";

export async function requirePageSession() {
  if (getServerEnv().NEXT_PUBLIC_DATA_SOURCE !== "http") return;
  const requestHeaders = await headers();
  try {
    await requireSession(new Request("http://internal", { headers: requestHeaders }));
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const next = safeNextPath(requestHeaders.get("x-siro-path"));
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
}
