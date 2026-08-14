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

const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

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

// Not configured: fail OPEN in development (so local dev works without an Upstash
// account), but fail CLOSED in production — a missing rate limiter in prod is a
// misconfiguration, and silently disabling protection on login/upload/comment
// endpoints is worse than blocking the action until it's fixed.
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
  const allow = process.env.NODE_ENV !== "production";
  return { success: allow, limit, remaining: allow ? limit : 0, reset: Date.now() };
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
    console.error(`[rate-limit] Upstash getRemaining failed for key "${key}" — failing closed:`, error);
    return { success: false, limit, remaining: 0, reset: Date.now() + 60_000 };
  }
}
