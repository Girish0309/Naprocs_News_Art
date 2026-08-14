import { describe, it, expect } from "vitest";
import { computeFingerprint } from "@/lib/fingerprint";

// T-095
describe("computeFingerprint", () => {
  it("is deterministic for the same ip + user-agent", () => {
    const a = computeFingerprint("203.0.113.5", "Mozilla/5.0 Test");
    const b = computeFingerprint("203.0.113.5", "Mozilla/5.0 Test");
    expect(a).toBe(b);
  });

  it("differs when the IP changes", () => {
    const a = computeFingerprint("203.0.113.5", "Mozilla/5.0 Test");
    const b = computeFingerprint("203.0.113.6", "Mozilla/5.0 Test");
    expect(a).not.toBe(b);
  });

  it("differs when the user-agent changes", () => {
    const a = computeFingerprint("203.0.113.5", "Mozilla/5.0 Test");
    const b = computeFingerprint("203.0.113.5", "Different Agent");
    expect(a).not.toBe(b);
  });

  it("produces a 64-character hex sha256 digest", () => {
    const hash = computeFingerprint("203.0.113.5", "Mozilla/5.0 Test");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
