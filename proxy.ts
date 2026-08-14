import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { useSecureCookies } from "@/lib/auth-cookie-config";

// Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts` (functionality
// is unchanged, only the file/export name — see next.js.org/docs/messages/middleware-to-proxy).
// This is the actual auth gate for /admin/*, not just UI-level hiding: it runs on the
// server before any admin route renders and redirects unauthenticated requests.

const LOGIN_PATH = "/admin/login";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === LOGIN_PATH) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: useSecureCookies,
  });

  if (!token) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
