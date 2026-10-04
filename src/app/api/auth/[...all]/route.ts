import { getAuth } from "@/server/auth";
import { apiError, checkOrigin, readJson } from "@/server/api";
import { getServerEnv } from "@/server/env";
import { enforceLimit } from "@/server/rate-limit";
import { ApiError } from "@/server/api-error";
import { z } from "zod";

export const runtime = "nodejs";
async function handle(request: Request) {
  try {
    if (getServerEnv().NEXT_PUBLIC_DATA_SOURCE !== "http") throw new ApiError(404, "NOT_FOUND");
    checkOrigin(request);
    const path = new URL(request.url).pathname;
    if (request.method === "POST") {
      const body = z
        .object({ email: z.string().max(254).optional() })
        .passthrough()
        .parse(await readJson(request.clone(), 64 * 1024));
      // Only trust forwarding headers on the configured deployment gateway.
      const env = getServerEnv();
      const header = env.DEPLOYMENT_ENV === "local" ? "x-forwarded-for" : env.TRUSTED_IP_HEADER;
      const ip = request.headers.get(header)?.split(",")[0].trim() ?? "unknown";
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (path.endsWith("/sign-in/email")) await enforceLimit(`login:${ip}:${email}`, 5, 60);
      if (path.endsWith("/sign-up/email")) await enforceLimit(`register:${ip}`, 3, 3600);
      if (path.endsWith("/request-password-reset")) await enforceLimit(`reset:${email}`, 3, 3600);
    }
    return getAuth().handler(request);
  } catch (error) {
    return apiError(error);
  }
}
export { handle as GET, handle as POST };
