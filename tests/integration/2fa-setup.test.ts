import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { connectTestDb, clearDatabase, createTestAdmin } from "../helpers/db";
import { fakeSession } from "../helpers/fixtures";
import Admin from "@/models/Admin";

// Mocks only the session-resolution seam (see testing/test-case-matrix.md's "Note on
// the auth mocking seam") — every other export of lib/auth.ts is untouched.
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getServerAuthSession: vi.fn() };
});

import { getServerAuthSession } from "@/lib/auth";
import { POST } from "@/app/api/admin/2fa/setup/route";

const mockSession = vi.mocked(getServerAuthSession);

describe("POST /api/admin/2fa/setup", () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
    mockSession.mockReset();
  });

  // T-015
  it("requires a session", async () => {
    mockSession.mockResolvedValue(null);
    const response = await POST();
    expect(response.status).toBe(401);
  });

  // T-016
  it("generates and persists a totp_secret, returning a QR data URL", async () => {
    const { admin } = await createTestAdmin();
    mockSession.mockResolvedValue(fakeSession(admin.id));

    const response = await POST();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(typeof body.secret).toBe("string");
    expect(body.otpauthUrl).toContain("otpauth://");
    expect(body.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

    const reloaded = await Admin.findById(admin.id);
    expect(reloaded?.totp_secret).toBe(body.secret);
  });
});
