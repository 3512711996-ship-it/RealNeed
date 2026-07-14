import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const path = request.nextUrl.pathname;

  if (path.startsWith("/deep-dive/") || path.startsWith("/admin/") || path === "/recover") {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  if (path.startsWith("/deep-dive/")) {
    response.headers.set("Referrer-Policy", "no-referrer");
  }

  return response;
}

export const config = {
  matcher: ["/deep-dive/:path*", "/admin/:path*", "/recover"]
};
