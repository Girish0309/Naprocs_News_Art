import { MongoMemoryServer } from "mongodb-memory-server";

// Runs once for the entire Vitest run (see vitest.config.ts's globalSetup), before any
// test file's module graph loads. Never points at the real dev/production database —
// this is the one and only Mongo instance every integration test connects to, through
// the app's own lib/db.ts singleton (see tests/helpers/db.ts). Setting process.env
// here, before Vitest's single fork imports any test file, is what makes MONGODB_URI
// visible to app code that reads it (lib/db.ts, lib/env.ts) exactly like a real
// deployment would set it — no separate test-only config path to keep in sync.
export default async function setup() {
  const mongod = await MongoMemoryServer.create({
    binary: { version: "8.2.6" },
  });

  process.env.MONGODB_URI = mongod.getUri("naprocs-newsletter-test");
  process.env.NEXTAUTH_SECRET = "test-secret-do-not-use-in-production-xxxxxxxxxxxx";
  process.env.NEXTAUTH_URL = "http://localhost:3000";
  // Deliberately left unset: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. Tests
  // that need rate-limiting to actually enforce (not fail open/closed by omission) set
  // these per-test via a mocked lib/rate-limit.ts instead — see
  // tests/unit/rate-limit.test.ts, which tests the fail-open/fail-closed branches
  // themselves, and tests/integration files that mock rateLimit's return value
  // directly to exercise the "limit exceeded" branch of the route under test.
  process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
  process.env.CLOUDINARY_API_KEY = "test-key";
  process.env.CLOUDINARY_API_SECRET = "test-secret";

  return async function teardown() {
    await mongod.stop();
  };
}
