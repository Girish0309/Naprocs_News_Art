import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { connectTestDb, clearDatabase } from "../helpers/db";
import { makeRequest } from "../helpers/request";
import { POST } from "@/app/api/admin/login/route";

// Deterministic fake for peekRateLimit — same reasoning as auth-authorize.test.ts (no
// real Upstash credentials in this environment; the real implementation fails open
// outside production).
const rateLimitState = vi.hoisted(() => ({ counts: new Map<string, number>() }));
vi.mock("@/lib/rate-limit", () => ({
  peekRateLimit: vi.fn(async (key: string, limit: number) => {
    const count = rateLimitState.counts.get(key) ?? 0;
    return { success: count < limit, limit, remaining: Math.max(0, limit - count), reset: Date.now() + 60_000 };
  }),
}));

describe("POST /api/admin/login (pre-flight peek)", () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
    rateLimitState.counts.clear();
  });

  // T-013
  it("allows a request under the limit", async () => {
    const response = await POST(
      makeRequest("/api/admin/login", { method: "POST", body: { email: "a@test.local", password: "x" } })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  // T-014
  it("returns 429 with Retry-After once the shared login:<ip> budget is exhausted", async () => {
    rateLimitState.counts.set("login:unknown", 5);
    const response = await POST(
      makeRequest("/api/admin/login", { method: "POST", body: { email: "a@test.local", password: "x" } })
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).not.toBeNull();
  });

  it("400s on a malformed body instead of 500ing", async () => {
    const response = await POST(makeRequest("/api/admin/login", { method: "POST", body: { email: "not-an-email" } }));
    expect(response.status).toBe(400);
  });
});
