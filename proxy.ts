import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken, encode } from "next-auth/jwt";
import {
  useSecureCookies,
  sessionCookieName,
  sessionCookieOptions,
  SESSION_MAX_AGE_SECONDS,
  SESSION_COOKIE_BROWSER_MAX_AGE_SECONDS,
} from "@/lib/auth-cookie-config";

// Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts` (functionality
// is unchanged, only the file/export name — see next.js.org/docs/messages/middleware-to-proxy).
// This is the actual auth gate for /admin/*, not just UI-level hiding: it runs on the
// server before any admin route renders and redirects unauthenticated requests.

const LOGIN_PATH = "/admin/login";
const LOGIN_API_PATH = "/api/admin/login";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === LOGIN_PATH || pathname === LOGIN_API_PATH) {
    return NextResponse.next();
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("Missing NEXTAUTH_SECRET environment variable.");
  }

  const isApiRoute = pathname.startsWith("/api/");
  const token = await getToken({ req: request, secret, secureCookie: useSecureCookies });

  if (!token) {
    if (isApiRoute) {
      // No redirect for API routes — every /api/admin/* route already returns its own
      // 401 JSON via getServerAuthSession(). Redirecting here would hand fetch()
      // callers an HTML login-page response instead of the JSON error they check for.
      return NextResponse.next();
    }

    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    // A stale/expired cookie was present (as opposed to no cookie at all) — that's a
    // real signal this redirect is an idle-timeout, not a first visit, so the login
    // page can say so instead of silently bouncing the admin back with no context.
    if (request.cookies.get(sessionCookieName)?.value) {
      loginUrl.searchParams.set("reason", "idle-timeout");
    }
    return NextResponse.redirect(loginUrl);
  }

  // Sliding idle timeout: NextAuth never refreshes this cookie on its own in this app
  // (see auth-cookie-config.ts) — re-issuing it here, on every authenticated request
  // this proxy sees, is what makes real activity keep the session alive instead of it
  // expiring on a flat timer from login.
  const response = NextResponse.next();
  // The JWT's own exp claim (maxAge here) is the real 15-minute boundary; the
  // cookie's browser-side maxAge is deliberately longer (see
  // SESSION_COOKIE_BROWSER_MAX_AGE_SECONDS) so an idle-expired cookie is still sent
  // on the next request instead of the browser silently discarding it first.
  const freshToken = await encode({ token, secret, maxAge: SESSION_MAX_AGE_SECONDS });
  response.cookies.set(sessionCookieName, freshToken, {
    ...sessionCookieOptions,
    maxAge: SESSION_COOKIE_BROWSER_MAX_AGE_SECONDS,
  });
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
