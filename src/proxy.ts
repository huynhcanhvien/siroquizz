import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-siro-path", request.nextUrl.pathname + request.nextUrl.search);
  if (process.env.NEXT_PUBLIC_DATA_SOURCE === "http" && !getSessionCookie(request)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next({ request: { headers } });
}
export const config = {
  matcher: [
    "/home/:path*",
    "/library/:path*",
    "/sets/:path*",
    "/study/:path*",
    "/settings/:path*",
    "/review/:path*",
    "/stats/:path*",
    "/folders/:path*",
    "/classes/:path*",
    "/admin/:path*",
  ],
};
