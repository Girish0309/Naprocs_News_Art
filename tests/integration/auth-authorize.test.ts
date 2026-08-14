import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import Admin from "@/models/Admin";
import { connectTestDb, clearDatabase, createTestAdmin } from "../helpers/db";
import { authOptions } from "@/lib/auth";

// No real Upstash credentials exist in this environment (see testing/test-case-
// matrix.md's notes) — the real lib/rate-limit.ts fails OPEN outside production, which
// would make T-009 below pass for the wrong reason (rate limiting never actually
// engaging) rather than the right one. Swapped for a real, deterministic, per-key
// fixed-window counter with the exact same call signature, matching the same
// test-double pattern the Module 7 audit used for the same reason. Every other test in
// this file (T-008, T-010, T-011, T-012) never exhausts the limit, so this has no
// effect on them beyond making the limiter genuinely enforce rather than fail open.
const rateLimitState = vi.hoisted(() => ({ counts: new Map<string, number>() }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async (key: string, limit: number) => {
    const count = (rateLimitState.counts.get(key) ?? 0) + 1;
    rateLimitState.counts.set(key, count);
    return { success: count <= limit, limit, remaining: Math.max(0, limit - count), reset: Date.now() + 60_000 };
  }),
}));

// Reaches the exact function NextAuth's own credentials flow invokes
// (`provider.authorize(credentials, req)` — confirmed by reading next-auth's own
// source) without going through NextAuth's HTTP/CSRF/cookie machinery, which needs a
// real Next.js request scope (`next/headers`) that doesn't exist outside an actual
// running server — see testing/test-case-matrix.md's "Note on the auth mocking seam".
// `CredentialsProvider({...})` stores the raw config object verbatim under `.options`
// (confirmed by reading next-auth/providers/credentials.js) — `.options.authorize` IS
// the real function from lib/auth.ts, not a stand-in.
const provider = authOptions.providers[0] as unknown as {
  options: {
    authorize: (
      credentials: Record<string, string> | undefined,
      req: { headers: Record<string, string> }
    ) => Promise<unknown>;
  };
};
const authorize = provider.options.authorize;

function reqFromIp(ip: string) {
  return { headers: { "x-forwarded-for": ip } };
}

describe("authorize() (NextAuth credentials provider, called directly)", () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
    rateLimitState.counts.clear();
  });

  // T-008
  it("returns null immediately for missing email or password, before touching the DB", async () => {
    const compareSpy = vi.spyOn(bcrypt, "compare");
    compareSpy.mockClear();
    expect(await authorize({ email: "", password: "x" }, reqFromIp("203.0.113.1"))).toBeNull();
    expect(await authorize(undefined, reqFromIp("203.0.113.1"))).toBeNull();
    expect(compareSpy).not.toHaveBeenCalled();
  });

  // T-009 — the regression test for audit finding 2.4: rate limiting must be enforced
  // inside authorize() itself, reachable no matter how the credentials flow is
  // invoked, not just via the /api/admin/login pre-flight route this test
  // deliberately never calls.
  it("rate-limits itself directly: the 6th attempt from the same IP within the window fails", async () => {
    const ip = "203.0.113.42";
    await createTestAdmin({ email: "ratelimit@test.local", password: "CorrectHorseBattery1" });

    const results: unknown[] = [];
    for (let i = 0; i < 6; i++) {
      // Wrong password every time — what matters is that even a WRONG-credentials
      // attempt still consumes the rate-limit budget, and that the 6th is rejected
      // for that reason specifically (not just "wrong password" again).
      results.push(await authorize({ email: "ratelimit@test.local", password: "wrong-password" }, reqFromIp(ip)));
    }

    expect(results.slice(0, 5).every((r) => r === null)).toBe(true);
    // Prove the 6th failure is the RATE LIMIT, not just another wrong-password null,
    // by switching to the CORRECT password — it should still be rejected because the
    // budget (not the credential check) is what's blocking it now.
    const sixthWithCorrectPassword = await authorize(
      { email: "ratelimit@test.local", password: "CorrectHorseBattery1" },
      reqFromIp(ip)
    );
    expect(sixthWithCorrectPassword).toBeNull();

    // A different IP is unaffected — the limit is keyed per-IP.
    const fromDifferentIp = await authorize(
      { email: "ratelimit@test.local", password: "CorrectHorseBattery1" },
      reqFromIp("203.0.113.99")
    );
    expect(fromDifferentIp).not.toBeNull();
  });

  // T-010 — the deterministic structural proxy for the timing side-channel fix
  // (audit 2.4/2.5's bonus finding): bcrypt.compare must run exactly once whether or
  // not the email matches an admin, so response latency alone never reveals whether
  // an email is registered. See testing/test-case-matrix.md's note on why this
  // replaces a literal wall-clock timing measurement.
  it("calls bcrypt.compare exactly once for a nonexistent email, same as for a wrong password on an existing one", async () => {
    await createTestAdmin({ email: "exists@test.local", password: "CorrectHorseBattery1" });

    const compareSpy = vi.spyOn(bcrypt, "compare");
    compareSpy.mockClear();
    await authorize({ email: "does-not-exist@test.local", password: "whatever123" }, reqFromIp("198.51.100.1"));
    expect(compareSpy).toHaveBeenCalledTimes(1);

    compareSpy.mockClear();
    await authorize({ email: "exists@test.local", password: "wrong-password" }, reqFromIp("198.51.100.2"));
    expect(compareSpy).toHaveBeenCalledTimes(1);
  });

  // T-011
  it("rejects a wrong password for an existing admin", async () => {
    await createTestAdmin({ email: "wrongpw@test.local", password: "CorrectHorseBattery1" });
    const result = await authorize({ email: "wrongpw@test.local", password: "nope" }, reqFromIp("198.51.100.10"));
    expect(result).toBeNull();
  });

  // T-012
  it("succeeds with correct credentials and updates last_login_at", async () => {
    const { admin } = await createTestAdmin({ email: "gooduser@test.local", password: "CorrectHorseBattery1" });
    expect(admin.last_login_at).toBeUndefined();

    const result = (await authorize(
      { email: "gooduser@test.local", password: "CorrectHorseBattery1" },
      reqFromIp("198.51.100.20")
    )) as { id: string; name: string; email: string } | null;

    expect(result).not.toBeNull();
    expect(result?.email).toBe("gooduser@test.local");

    const reloaded = await Admin.findById(admin.id);
    expect(reloaded?.last_login_at).toBeInstanceOf(Date);
  });
});
