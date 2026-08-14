import { MongoMemoryServer } from "mongodb-memory-server";

// Pinned to a fixed port (distinct from the user's own persistent dev-mongo instance on
// 27117 — see the conversation's established local-dev pattern) so playwright.config.ts's
// webServer.env can reference the same URI directly, with no IPC needed between this
// globalSetup process and the separate child process Playwright spawns for the dev
// server. Never the real dev/production database.
const E2E_MONGO_PORT = 27118;
export const E2E_MONGO_URI = `mongodb://127.0.0.1:${E2E_MONGO_PORT}/naprocs-newsletter-e2e`;

export default async function globalSetup() {
  const mongod = await MongoMemoryServer.create({
    instance: { port: E2E_MONGO_PORT },
    binary: { version: "8.2.6" },
  });

  return async function teardown() {
    await mongod.stop();
  };
}
