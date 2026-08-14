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
export function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    return origin === SITE_ORIGIN;
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === SITE_ORIGIN;
    } catch {
      return false;
    }
  }

  return false;
}
