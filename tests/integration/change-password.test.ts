import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { connectTestDb, clearDatabase, createTestAdmin } from "../helpers/db";
import { makeRequest } from "../helpers/request";
import { fakeSession } from "../helpers/fixtures";

const rateLimitState = vi.hoisted(() => ({ counts: new Map<string, number>() }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async (key: string, limit: number) => {
    const count = (rateLimitState.counts.get(key) ?? 0) + 1;
    rateLimitState.counts.set(key, count);
    return { success: count <= limit, limit, remaining: Math.max(0, limit - count), reset: Date.now() + 60_000 };
  }),
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getServerAuthSession: vi.fn() };
});

import { getServerAuthSession } from "@/lib/auth";
import { POST } from "@/app/api/admin/change-password/route";
import Admin from "@/models/Admin";

const mockSession = vi.mocked(getServerAuthSession);

describe("POST /api/admin/change-password", () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
    mockSession.mockReset();
    rateLimitState.counts.clear();
  });

  // T-017
  it("requires a session", async () => {
    mockSession.mockResolvedValue(null);
    const response = await POST(
      makeRequest("/api/admin/change-password", {
        method: "POST",
        body: { current_password: "x", new_password: "newpassword1" },
      })
    );
    expect(response.status).toBe(401);
  });

  // T-018
  it("rejects an incorrect current password", async () => {
    const { admin } = await createTestAdmin({ password: "CorrectHorseBattery1" });
    mockSession.mockResolvedValue(fakeSession(admin.id));

    const response = await POST(
      makeRequest("/api/admin/change-password", {
        method: "POST",
        body: { current_password: "wrong-password", new_password: "newpassword1" },
      })
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/incorrect/i);
  });

  // T-019
  it("succeeds and the new password authenticates on the next check, the old one no longer does", async () => {
    const { admin } = await createTestAdmin({ password: "CorrectHorseBattery1" });
    mockSession.mockResolvedValue(fakeSession(admin.id));

    const response = await POST(
      makeRequest("/api/admin/change-password", {
        method: "POST",
        body: { current_password: "CorrectHorseBattery1", new_password: "BrandNewPassword2" },
      })
    );
    expect(response.status).toBe(200);

    const reloaded = await Admin.findById(admin.id);
    expect(await bcrypt.compare("BrandNewPassword2", reloaded!.password_hash)).toBe(true);
    expect(await bcrypt.compare("CorrectHorseBattery1", reloaded!.password_hash)).toBe(false);
  });

  // T-020
  it("is rate-limited after 5 attempts within an hour for the same admin", async () => {
    const { admin } = await createTestAdmin({ password: "CorrectHorseBattery1" });
    mockSession.mockResolvedValue(fakeSession(admin.id));

    for (let i = 0; i < 5; i++) {
      const response = await POST(
        makeRequest("/api/admin/change-password", {
          method: "POST",
          body: { current_password: "wrong-again", new_password: "somethingnew1" },
        })
      );
      expect(response.status).toBe(400); // wrong current password, but not yet rate-limited
    }

    const sixth = await POST(
      makeRequest("/api/admin/change-password", {
        method: "POST",
        body: { current_password: "CorrectHorseBattery1", new_password: "somethingnew1" },
      })
    );
    expect(sixth.status).toBe(429);
  });
});
