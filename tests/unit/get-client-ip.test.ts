import { describe, it, expect } from "vitest";
import { getClientIp } from "@/lib/get-client-ip";

// T-004, T-005, T-006
describe("getClientIp", () => {
  it("returns the first IP from a comma-separated x-forwarded-for, trimmed", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1, 10.0.0.2" });
    expect(getClientIp(headers)).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const headers = new Headers({ "x-real-ip": "198.51.100.7" });
    expect(getClientIp(headers)).toBe("198.51.100.7");
  });

  it("returns 'unknown' when neither header is present", () => {
    expect(getClientIp(new Headers())).toBe("unknown");
    expect(getClientIp(undefined)).toBe("unknown");
  });

  it("also works with a plain lowercase-keyed object (NextAuth's authorize() req shape)", () => {
    expect(getClientIp({ "x-forwarded-for": "203.0.113.9" })).toBe("203.0.113.9");
    expect(getClientIp({ "x-forwarded-for": ["203.0.113.10", "ignored"] })).toBe("203.0.113.10");
  });
});
