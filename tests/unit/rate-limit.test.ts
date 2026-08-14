import { describe, it, expect, afterEach } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

// Next's own type augmentation declares NODE_ENV readonly to prevent accidental
// mutation in app code — these tests deliberately override it to exercise both
// branches, so process.env is widened to a mutable shape just for that assignment.
const mutableEnv = process.env as Record<string, string | undefined>;

// T-088, T-089. Relies on UPSTASH_REDIS_REST_URL/TOKEN being unset for the whole suite
// (tests/setup/global-setup.ts deliberately never sets them, matching this repo's real
// .env.local — no Upstash account exists), so lib/rate-limit.ts's module-level `redis`
// client is null and every call here takes the "unconfigured" branch under test.
describe("rateLimit (unconfigured — no Upstash credentials)", () => {
  const originalNodeEnv = mutableEnv.NODE_ENV;

  afterEach(() => {
    mutableEnv.NODE_ENV = originalNodeEnv;
  });

  it("fails OPEN outside production", async () => {
    mutableEnv.NODE_ENV = "development";
    const result = await rateLimit("test:fail-open", 5, "15m");
    expect(result.success).toBe(true);
  });

  it("fails CLOSED in production", async () => {
    mutableEnv.NODE_ENV = "production";
    const result = await rateLimit("test:fail-closed", 5, "15m");
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });
});
