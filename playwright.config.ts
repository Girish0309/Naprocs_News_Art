import { defineConfig, devices } from "@playwright/test";
import { E2E_MONGO_URI } from "./e2e/global-setup";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

// Runs against a real `next dev` instance on its own dedicated port (3100, distinct
// from the port the user's own dev server normally runs on) and its own dedicated
// in-memory MongoDB instance (e2e/global-setup.ts) — never the real dev/production
// database. `reuseExistingServer: false` is intentional, not the common
// `!process.env.CI` idiom: reusing whatever happens to already be running on this
// machine could mean silently running these tests against the user's real dev server
// and real dev database instead of this isolated one, which is exactly what item 1 of
// this module's brief rules out. CLOUDINARY_MOCK=true activates lib/cloudinary.ts's
// test-only double (see its own comment) — there's no real Cloudinary account in this
// environment (DEVIATIONS.md, Module 4) and none is needed for a fake upload to
// exercise the real UI, real magic-byte check, and real publish-validation gate.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      MONGODB_URI: E2E_MONGO_URI,
      NEXTAUTH_SECRET: "e2e-test-secret-do-not-use-in-production-xxxxx",
      NEXTAUTH_URL: BASE_URL,
      CLOUDINARY_MOCK: "true",
      NEXT_TELEMETRY_DISABLED: "1",
      // Deliberately unset: UPSTASH_REDIS_REST_URL/TOKEN, CLOUDINARY_CLOUD_NAME/KEY/
      // SECRET — see testing/test-case-matrix.md's note 3 for why real rate-limit
      // enforcement isn't exercised at the E2E layer, and lib/cloudinary.ts's own
      // comment for why CLOUDINARY_MOCK makes the real Cloudinary vars moot here.
    },
  },
});
