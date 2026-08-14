// Shared between lib/auth.ts (sets the cookie) and proxy.ts (reads it via getToken).
// Kept in its own module, free of mongoose/bcrypt imports, so proxy.ts's bundle stays light.
export const useSecureCookies = process.env.NODE_ENV === "production";

export const sessionCookieName = `${useSecureCookies ? "__Secure-" : ""}next-auth.session-token`;
