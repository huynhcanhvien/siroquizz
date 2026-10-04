import { getServerEnv } from "@/server/env";
export async function GET() {
  const env = getServerEnv();
  return Response.json(
    { success: true, data: { google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
