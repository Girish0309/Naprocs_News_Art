import { test, expect } from "@playwright/test";
import { seedAdmin } from "./helpers/seed";

const ADMIN_EMAIL = "e2e-auth-callback@test.local";
const ADMIN_PASSWORD = "CorrectHorseBattery1";

// T-099 — see testing/test-case-matrix.md's note 3 for why this is scoped to proving
// the real NextAuth callback endpoint enforces credentials on its own (reachable
// independently of /api/admin/login's pre-flight check), rather than re-proving the
// specific "6th attempt" rate-limit threshold — that's T-009's job (deterministic,
// mocked, in the Vitest suite), since this repo's E2E server has no real Upstash
// credentials to rate-limit against for real. Uses Playwright's `request` fixture only
// — no browser page needed — since this is deliberately going around the UI (and the
// pre-flight route the UI calls) straight at the API NextAuth itself serves.
test("NextAuth credentials callback enforces real credentials independent of the pre-flight route", async ({
  request,
}) => {
  await seedAdmin(ADMIN_EMAIL, ADMIN_PASSWORD);

  const csrfResponse = await request.get("/api/auth/csrf");
  expect(csrfResponse.ok()).toBe(true);
  const { csrfToken } = await csrfResponse.json();
  expect(typeof csrfToken).toBe("string");

  await test.step("valid credentials authenticate", async () => {
    const response = await request.post("/api/auth/callback/credentials", {
      form: { csrfToken, email: ADMIN_EMAIL, password: ADMIN_PASSWORD, json: "true" },
    });
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.url).not.toContain("error=CredentialsSignin");

    const setCookieHeader = response.headers()["set-cookie"] ?? "";
    expect(setCookieHeader).toContain("next-auth.session-token");
  });

  await test.step("invalid credentials are rejected by the same endpoint", async () => {
    const response = await request.post("/api/auth/callback/credentials", {
      form: { csrfToken, email: ADMIN_EMAIL, password: "definitely-the-wrong-password", json: "true" },
    });
    const body = await response.json();
    expect(body.url).toContain("error=CredentialsSignin");
  });

  await test.step("a nonexistent email is rejected identically, not a different error", async () => {
    const response = await request.post("/api/auth/callback/credentials", {
      form: { csrfToken, email: "no-such-admin@test.local", password: "whatever123", json: "true" },
    });
    const body = await response.json();
    expect(body.url).toContain("error=CredentialsSignin");
  });
});
