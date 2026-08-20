import type { NextRequest } from "next/server";
import { SITE_URL } from "@/lib/site-config";

const SITE_ORIGIN = new URL(SITE_URL).origin;

/**
 * Same-origin check for the two POST endpoints that have no session to bind a CSRF
 * token to (comments, reactions — both anonymous, fingerprint-only). Browsers send
 * `Origin` on every cross-site AND same-site POST/PUT/PATCH/DELETE request (per the
 * Fetch spec), so a same-site form/fetch submission always has it; a cross-site page
 * trying to forge a request either sends its OWN origin (mismatch, rejected) or, for
 * a handful of legacy/non-fetch submission paths, omits Origin but still sends
 * Referer, which is checked as a fallback. Missing both is treated as a mismatch —
 * fail closed, not open, matching the fail-closed rate-limit precedent from the
 * Module 1-7 audit.
 *
 * Not used on the admin routes: those are authenticated via NextAuth's session
 * cookie, which already carries its own CSRF protection (a token from
 * /api/auth/csrf, verified against the session on every credentials sign-in) — this
 * check would be redundant there, and isn't a substitute for it anyway, since it says
 * nothing about *who* is asking, only *where from*.
 */
// Server-log-only diagnostics for a rejection — never returned to the client (the
// route handlers that call isSameOriginRequest() only ever send back a generic
// "Cross-site request blocked", by design, since telling a caller exactly why would
// help an actual forger calibrate their request). This exists because an env var
// mismatch (NEXTAUTH_URL not matching the real deployed domain after a redeploy or
// domain change) produces the exact same generic rejection as a real forged request,
// with nothing to distinguish the two from the client's point of view — this is the
// only place that distinction is visible at all.
function logRejection(request: NextRequest, receivedOrigin: string | null, receivedReferer: string | null): void {
  console.error(
    `[csrf] Rejected ${request.method} ${request.nextUrl.pathname} — expected origin "${SITE_ORIGIN}" (from SITE_URL/NEXTAUTH_URL), received Origin: ${receivedOrigin ?? "(none)"}, Referer: ${receivedReferer ?? "(none)"}`
  );
}

export function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (origin) {
    const matches = origin === SITE_ORIGIN;
    if (!matches) logRejection(request, origin, referer);
    return matches;
  }

  if (referer) {
    try {
      const matches = new URL(referer).origin === SITE_ORIGIN;
      if (!matches) logRejection(request, origin, referer);
      return matches;
    } catch {
      logRejection(request, origin, referer);
      return false;
    }
  }

  logRejection(request, origin, referer);
  return false;
}
