// Shared between lib/auth.ts (sets the cookie) and proxy.ts (reads/refreshes it via
// next-auth/jwt). Kept in its own module, free of mongoose/bcrypt imports, so
// proxy.ts's bundle stays light.
export const useSecureCookies = process.env.NODE_ENV === "production";

export const sessionCookieName = `${useSecureCookies ? "__Secure-" : ""}next-auth.session-token`;

// A genuine 15-minute *idle* timeout, not a flat expiry from login time. NextAuth
// itself never refreshes this cookie in this app: its own JWT-session refresh path
// (core/routes/session.js) only fires from the /api/auth/session route, and this app
// has no SessionProvider/useSession anywhere to ever call it — confirmed by reading
// that source rather than assumed. So proxy.ts re-encodes and re-issues this cookie
// with a fresh SESSION_MAX_AGE_SECONDS window on every authenticated request it sees;
// real activity keeps sliding the expiry forward, and only genuine inactivity past
// this many seconds lets the token actually expire and force re-login.
export const SESSION_MAX_AGE_SECONDS = 15 * 60;

// Deliberately much longer than SESSION_MAX_AGE_SECONDS, and used ONLY as the
// browser-facing cookie's own `maxAge`/`expires` attribute in proxy.ts's refresh —
// never as the JWT's own cryptographic maxAge. If the two were equal (as NextAuth's
// own login-time cookie briefly is, and as this was before this comment), the browser
// deletes the cookie itself the moment SESSION_MAX_AGE_SECONDS elapses, so by the time
// an idle-expired request reaches proxy.ts there's no cookie left to inspect — "timed
// out" and "never logged in" become indistinguishable (found live: the reason=
// idle-timeout redirect param never appeared, because request.cookies.get() was
// already empty). Keeping the cookie physically alive for longer, while getToken()'s
// decode() still independently and correctly rejects it the instant its real exp
// claim passes, lets proxy.ts tell "a session just expired" (stale cookie present)
// apart from "no session ever" (no cookie at all) without weakening the 15-minute
// timeout itself — that boundary is enforced by the JWT's own exp claim, not by
// whether the browser still has the cookie.
export const SESSION_COOKIE_BROWSER_MAX_AGE_SECONDS = 24 * 60 * 60;

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  path: "/",
  secure: useSecureCookies,
};
