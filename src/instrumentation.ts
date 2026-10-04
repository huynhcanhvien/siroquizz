/** Next.js calls register once when each server instance starts. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getServerEnv } = await import("./server/env");
    getServerEnv();
  }
}
