import { NextRequest } from "next/server";

const BASE_URL = "http://localhost:3000";

interface MakeRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  searchParams?: Record<string, string>;
}

/**
 * Builds a real `NextRequest` — the same class every route handler's `request`
 * parameter actually is at runtime — so route handlers under test run against the real
 * Request/Headers/URL machinery, not a hand-rolled stand-in. `origin` defaults to the
 * app's own site origin (matching lib/site-config.ts's SITE_URL, itself NEXTAUTH_URL —
 * see tests/setup/global-setup.ts) so same-origin checks (lib/csrf.ts) pass by default;
 * tests exercising the CSRF rejection path override it explicitly.
 */
export function makeRequest(path: string, options: MakeRequestOptions = {}): NextRequest {
  const url = new URL(path, BASE_URL);
  if (options.searchParams) {
    for (const [key, value] of Object.entries(options.searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  const headers = new Headers(options.headers ?? {});
  const method = options.method ?? "GET";
  const hasBody = options.body !== undefined && method !== "GET" && method !== "HEAD";

  if (hasBody && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (!headers.has("origin") && method !== "GET") {
    headers.set("origin", BASE_URL);
  }

  return new NextRequest(url, {
    method,
    headers,
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });
}

/** Route handlers receive `{ params: Promise<{...}> }` in Next 15+/16 — see any
 * `RouteContext<"...">` usage in app/api/**\/route.ts. */
export function makeContext<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}
