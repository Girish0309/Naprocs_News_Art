import { z } from "zod";

/**
 * Shared query-string validation pieces, used across every route that reads
 * pagination/search params from the URL (public + admin article listings, search).
 * Reused rather than each route hand-rolling its own Number()/parseInt() parsing —
 * see the Module 11 security pass, which found these were all validated ad hoc.
 *
 * Pagination fields use `.catch()`, not `.refine`/rejection: a malformed `page`/
 * `limit` isn't a security-relevant input here (nothing downstream trusts it for
 * anything but a bounded skip/limit), so it silently falls back to a sane default
 * exactly like the original hand-rolled `Number(x) || fallback` logic did — this
 * only formalizes that behavior through Zod, it doesn't change it. Fields that
 * genuinely indicate a malformed request (an invalid status enum, an empty search
 * string) are left to fail normally and produce a 400.
 */
export const pageParam = z.coerce.number().int().min(1).catch(1);

export function limitParam(defaultLimit: number, max: number) {
  return z.coerce.number().int().min(1).max(max).catch(defaultLimit);
}

/** A non-empty, length-bounded free-text query string (search `q`, listing `tag`). */
export function boundedTextParam(maxLength: number) {
  return z.string().trim().min(1).max(maxLength);
}
