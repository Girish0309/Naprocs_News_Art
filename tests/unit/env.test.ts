import { describe, it, expect, afterEach } from "vitest";
import { validateEnv } from "@/lib/env";

// T-001, T-002, T-003
describe("validateEnv", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("throws naming MONGODB_URI when it's missing", () => {
    process.env.MONGODB_URI = "";
    process.env.NEXTAUTH_SECRET = "secret";
    expect(() => validateEnv()).toThrowError(/MONGODB_URI/);
  });

  it("throws naming NEXTAUTH_SECRET when it's missing", () => {
    process.env.MONGODB_URI = "mongodb://localhost/test";
    process.env.NEXTAUTH_SECRET = "";
    expect(() => validateEnv()).toThrowError(/NEXTAUTH_SECRET/);
  });

  it("does not throw when both are set", () => {
    process.env.MONGODB_URI = "mongodb://localhost/test";
    process.env.NEXTAUTH_SECRET = "secret";
    expect(() => validateEnv()).not.toThrow();
  });
});
