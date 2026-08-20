import { describe, it, expect } from "vitest";
import type { NextRequest } from "next/server";
import { isSameOriginRequest } from "@/lib/csrf";

// T-084, T-085, T-086, T-087. SITE_ORIGIN is derived from NEXTAUTH_URL
// (http://localhost:3000 — see tests/setup/global-setup.ts), matched here directly.
function requestWith(headers: Record<string, string>): NextRequest {
  return {
    headers: new Headers(headers),
    method: "POST",
    nextUrl: new URL("http://localhost:3000/api/articles/some-id/react"),
  } as NextRequest;
}

describe("isSameOriginRequest", () => {
  it("passes when Origin matches the site origin", () => {
    expect(isSameOriginRequest(requestWith({ origin: "http://localhost:3000" }))).toBe(true);
  });

  it("rejects a mismatched Origin", () => {
    expect(isSameOriginRequest(requestWith({ origin: "https://evil.example" }))).toBe(false);
  });

  it("falls back to a matching Referer when Origin is absent", () => {
    expect(isSameOriginRequest(requestWith({ referer: "http://localhost:3000/articles/foo" }))).toBe(true);
  });

  it("rejects a mismatched Referer when Origin is absent", () => {
    expect(isSameOriginRequest(requestWith({ referer: "https://evil.example/articles/foo" }))).toBe(false);
  });

  it("fails closed when neither Origin nor Referer is present", () => {
    expect(isSameOriginRequest(requestWith({}))).toBe(false);
  });

  it("fails closed on a malformed Referer instead of throwing", () => {
    expect(isSameOriginRequest(requestWith({ referer: "not a url" }))).toBe(false);
  });
});
