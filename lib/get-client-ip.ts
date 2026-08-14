// Accepts either a real WHATWG `Headers` (Route Handlers) or the plain lowercase-keyed
// object NextAuth's `authorize(credentials, req)` passes as `req.headers` — this utility
// is shared by both call sites (see lib/auth.ts's authorize(), which enforces the login
// rate limit directly, and app/api/admin/login/route.ts's non-consuming pre-flight peek).
type HeaderSource = Headers | Record<string, string | string[] | undefined> | null | undefined;

function readHeader(headers: HeaderSource, name: string): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? undefined;
  }
  const value = (headers as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Next.js Route Handlers don't expose a `request.ip` (removed in favor of reading
 * headers directly, since the "real" client IP depends on your proxy setup).
 * `x-forwarded-for` is set by Vercel and most reverse proxies; falls back to
 * `x-real-ip`, then "unknown" for local requests with neither header.
 */
export function getClientIp(headers: HeaderSource): string {
  const forwardedFor = readHeader(headers, "x-forwarded-for");
  const first = forwardedFor?.split(",")[0]?.trim();
  if (first) return first;

  const realIp = readHeader(headers, "x-real-ip");
  if (realIp) return realIp;

  return "unknown";
}
