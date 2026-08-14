import { defineConfig } from "vitest/config";
import path from "node:path";

// Every test file needing the DB (tests/integration/**) connects through the app's
// own real lib/db.ts singleton — not a second, parallel test-only DB client — so the
// exact caching/connection code every route handler relies on is what's under test
// too. That singleton caches its connection on `global`, which Node's `global` object
// keeps intact across test files as long as they all run in the SAME process.
// `fileParallelism: false` (Vitest 4's top-level replacement for the removed
// `poolOptions.forks.singleFork`) pins the whole run to one worker for exactly this
// reason: real multi-process/thread parallelism would mean some files spin up their
// own redundant in-memory MongoDB (slow, and defeats the point of one shared instance
// from tests/setup/global-setup.ts) or race on `global._mongooseCache` pointing at
// whichever instance happened to win. Vitest's per-file module-registry reset
// (`isolate`, on by default) still keeps `vi.mock()` calls scoped to the file that
// declared them even with parallelism off — only the real Node `global` object (and
// thus the Mongo connection cache) is shared, which is the intended behavior here.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    pool: "forks",
    fileParallelism: false,
    globalSetup: ["./tests/setup/global-setup.ts"],
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    testTimeout: 15_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
      // Coverage reporting is scoped to the security/data-integrity-critical surface
      // (API routes + the lib/ modules they depend on), per this module's brief —
      // not a repo-wide percentage target, and explicitly not UI components (those are
      // covered by behavior, not line count, via the Playwright E2E specs instead).
      include: ["app/api/**/*.ts", "lib/**/*.ts"],
      exclude: ["lib/site-config.ts", "lib/env.ts", "lib/cloudinary.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
