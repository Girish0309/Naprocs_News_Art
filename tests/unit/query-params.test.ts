import { describe, it, expect } from "vitest";
import { pageParam, limitParam, boundedTextParam } from "@/lib/query-params";

// T-075, T-076
describe("pageParam", () => {
  it("parses a valid page number", () => {
    expect(pageParam.parse("3")).toBe(3);
  });

  it("falls back to 1 for non-numeric input instead of throwing", () => {
    expect(pageParam.parse("not-a-number")).toBe(1);
  });

  it("falls back to 1 for zero/negative input", () => {
    expect(pageParam.parse("0")).toBe(1);
    expect(pageParam.parse("-5")).toBe(1);
  });
});

describe("limitParam", () => {
  const limit = limitParam(10, 50);

  it("parses a valid limit within range", () => {
    expect(limit.parse("20")).toBe(20);
  });

  it("falls back to the default for non-numeric input", () => {
    expect(limit.parse("banana")).toBe(10);
  });

  it("falls back to the default when over the max", () => {
    expect(limit.parse("9999")).toBe(10);
  });
});

describe("boundedTextParam", () => {
  const query = boundedTextParam(10);

  it("accepts a non-empty string within the length bound", () => {
    expect(query.parse("hello")).toBe("hello");
  });

  it("rejects an empty string", () => {
    expect(query.safeParse("").success).toBe(false);
  });

  it("rejects a string longer than maxLength", () => {
    expect(query.safeParse("this is way too long").success).toBe(false);
  });

  it("trims surrounding whitespace", () => {
    expect(query.parse("  hi  ")).toBe("hi");
  });
});
