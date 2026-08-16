import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type Duration = `${number} ${"ms" | "s" | "m" | "h" | "d"}` | `${number}${"ms" | "s" | "m" | "h" | "d"}`;

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Epoch ms when the window resets. */
  reset: number;
}

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

// rateLimit()/peekRateLimit() run synchronously inside the login, comment, and
// reaction request paths — an unbounded hang here is worse than having no rate
// limiter at all (it takes those endpoints down with it, with zero fallback), the
// same class of bug lib/db.ts's serverSelectionTimeoutMS fixes for MongoDB. 2.5s is
// short because this should resolve fast or not at all.
const RATE_LIMIT_TIMEOUT_MS = 2500;

const redis =
  redisUrl && redisToken
    ? new Redis({
        url: redisUrl,
        token: redisToken,
        // A *function* here, not a plain AbortSignal — a single AbortSignal can only
        // ever fire once, but this client is reused across the process's lifetime, so
        // a static signal would only protect the first call. The SDK (see
        // node_modules/@upstash/redis nodejs.js's HttpClient.request) calls this once
        // per request and, critically, checks `isSignalFunction` when a fetch attempt
        // throws: if the signal came from a function and has fired, it re-throws
        // immediately instead of retrying — so this bounds the WHOLE call (its
        // internal retries included, up to 5 by default) to one 2.5s window, not
        // several stacked ones.
        signal: () => AbortSignal.timeout(RATE_LIMIT_TIMEOUT_MS),
      })
    : null;

let warnedMissingConfig = false;

// One Ratelimit instance per (limit, window) pair, reused across calls so we're not
// constructing a new client on every request.
const limiters = new Map<string, Ratelimit>();

function getLimiter(limit: number, window: Duration): Ratelimit {
  const cacheKey = `${limit}:${window}`;
  const existing = limiters.get(cacheKey);
  if (existing) return existing;

  const limiter = new Ratelimit({
    redis: redis as Redis,
    limiter: Ratelimit.slidingWindow(limit, window),
    analytics: false,
    prefix: "naprocs-newsletter/rate-limit",
  });
  limiters.set(cacheKey, limiter);
  return limiter;
}

// Shared by "Upstash isn't configured at all" and "Upstash didn't respond within
// RATE_LIMIT_TIMEOUT_MS" — from the caller's perspective both mean the same thing:
// no working rate-limit enforcement is available right now. Fail OPEN in development
// (so local dev isn't blocked by a slow or not-yet-configured Upstash), fail CLOSED in
// production — a missing rate limiter in prod is a misconfiguration, and silently
// disabling protection on login/upload/comment endpoints is worse than blocking the
// action until it's fixed. Deliberately distinct from a genuine mid-request failure
// (network error, Upstash outage) below, which fails closed unconditionally in both
// environments — that's a rarer, more suspicious failure than "not configured yet" or
// "timed out," so it doesn't get dev's fail-open convenience.
function resultWhenNoEnforcementAvailable(limit: number): RateLimitResult {
  const allow = process.env.NODE_ENV !== "production";
  return { success: allow, limit, remaining: allow ? limit : 0, reset: Date.now() };
}

function resultWhenUnconfigured(limit: number): RateLimitResult {
  if (!warnedMissingConfig) {
    warnedMissingConfig = true;
    const message =
      "[rate-limit] UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN are not set.";
    if (process.env.NODE_ENV === "production") {
      console.error(`${message} Failing CLOSED (blocking all requests) in production.`);
    } else {
      console.warn(`${message} Failing open (all requests allowed) outside production.`);
    }
  }
  return resultWhenNoEnforcementAvailable(limit);
}

// AbortSignal.timeout()'s own firing produces a DOMException named "TimeoutError" —
// the spec-defined way to tell "our deliberate timeout fired" apart from any other
// rejection (a real Upstash-side error, a non-timeout network failure), which stays on
// the unconditional-fail-closed path below instead.
function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}

function logTimeout(action: string, key: string): void {
  const message = `[rate-limit] Upstash ${action} timed out after ${RATE_LIMIT_TIMEOUT_MS}ms for key "${key}".`;
  if (process.env.NODE_ENV === "production") {
    console.error(`${message} Failing CLOSED (blocking) in production.`);
  } else {
    console.warn(`${message} Failing open (allowed) outside production — same as an unconfigured Upstash.`);
  }
}

/**
 * Sliding-window rate limit backed by Upstash Redis.
 *
 * @param key A namespaced identifier for what's being limited, e.g. `login:203.0.113.5`.
 * @param limit Max requests allowed within `window`.
 * @param window Window size, e.g. "15m", "1 h", "30s".
 *
 * See `resultWhenUnconfigured` for behavior when Upstash isn't configured. If Upstash
 * *is* configured but the request to it fails (network error, outage), this also fails
 * closed rather than letting the exception propagate uncaught — a rate limiter that
 * errors open under load is not a rate limiter.
 */
export async function rateLimit(key: string, limit: number, window: Duration): Promise<RateLimitResult> {
  if (!redis) {
    return resultWhenUnconfigured(limit);
  }

  try {
    const result = await getLimiter(limit, window).limit(key);
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (error) {
    if (isTimeoutError(error)) {
      logTimeout("request", key);
      return resultWhenNoEnforcementAvailable(limit);
    }
    console.error(`[rate-limit] Upstash request failed for key "${key}" — failing closed:`, error);
    return { success: false, limit, remaining: 0, reset: Date.now() + 60_000 };
  }
}

/**
 * Non-consuming check: reports whether `key` is currently at/over `limit` without
 * counting as a new attempt. Used by the login pre-flight route so it can show an
 * immediate "too many attempts" message without spending one of the attempts that
 * `rateLimit()` (called authoritatively inside NextAuth's `authorize()`) enforces.
 */
export async function peekRateLimit(key: string, limit: number, window: Duration): Promise<RateLimitResult> {
  if (!redis) {
    return resultWhenUnconfigured(limit);
  }

  try {
    const result = await getLimiter(limit, window).getRemaining(key);
    return { success: result.remaining > 0, limit: result.limit, remaining: result.remaining, reset: result.reset };
  } catch (error) {
    if (isTimeoutError(error)) {
      logTimeout("getRemaining", key);
      return resultWhenNoEnforcementAvailable(limit);
    }
    console.error(`[rate-limit] Upstash getRemaining failed for key "${key}" — failing closed:`, error);
    return { success: false, limit, remaining: 0, reset: Date.now() + 60_000 };
  }
}
