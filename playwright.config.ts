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
      // Explicitly blanked, not just "left unset": Next.js auto-loads the real
      // .env.local for ANY `next dev` process in this directory, including this
      // isolated one — process.env values passed here take precedence over that file,
      // but only if the key is actually present (even as ""). Once a real
      // CLOUDINARY_CLOUD_NAME exists in .env.local (it now does), next.config.ts's
      // `images.remotePatterns` pathname narrows to that real cloud name, which
      // doesn't match the mocked-Cloudinary `res.cloudinary.com/mock/...` URLs this
      // suite generates — next/image then hard-rejects them as an unconfigured host,
      // taking down every page that renders a cover image. Found via a real E2E
      // failure (`Invalid src prop ... hostname "res.cloudinary.com" is not
      // configured`), not hypothetically. Blanking it here forces next.config.ts's
      // `/**` wildcard fallback regardless of what's in the developer's own
      // .env.local. CLOUDINARY_API_KEY/SECRET don't need the same treatment — only
      // lib/cloudinary.ts reads them, and CLOUDINARY_MOCK=true already bypasses that
      // file entirely — but blanked too for the same defense-in-depth reasoning.
      CLOUDINARY_CLOUD_NAME: "",
      CLOUDINARY_API_KEY: "",
      CLOUDINARY_API_SECRET: "",
      // Explicitly blanked for the identical reason as the Cloudinary vars above, and
      // considerably higher-stakes: .env.local now has a real Upstash Redis account
      // too. Unlike CLOUDINARY_MOCK's in-memory double (which resets every process
      // restart), Upstash is a real external store whose sliding-window counters
      // PERSIST across separate `npm run test:e2e` invocations. With this unblanked,
      // every E2E run's login attempts (admin-flow's real login + auth-rate-limit's
      // deliberate wrong-password attempt, both keyed by IP) consumed real quota
      // against the production login rate limit (5/15min) — meaning repeated local
      // runs, or CI runs close together, silently start failing real logins with no
      // relationship to any code change, and are actually throttling the real
      // production Upstash account, not a test double. Found by re-running the suite
      // 4 times in a row and getting a DIFFERENT test fail each time (login itself,
      // then a cover-upload step, then a direct-HTTP credentials check) — a classic
      // shared-external-state flake signature, not a deterministic bug. Blanking
      // these forces `lib/rate-limit.ts`'s documented fail-open-outside-production
      // path (redis client is null → resultWhenUnconfigured → always allow) instead
      // of ever reaching the real service, matching what testing/test-case-matrix.md's
      // note 3 always assumed was happening here.
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
