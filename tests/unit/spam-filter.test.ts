import { describe, it, expect } from "vitest";
import { checkForSpam } from "@/lib/spam-filter";

// T-096
describe("checkForSpam", () => {
  it("flags a known spam keyword and names it in the reason", () => {
    const result = checkForSpam("Buy real viagra online cheap!");
    expect(result.flagged).toBe(true);
    expect(result.reason).toContain("viagra");
  });

  it("flags more than one link", () => {
    const result = checkForSpam("Check https://a.example and also https://b.example");
    expect(result.flagged).toBe(true);
    expect(result.reason).toContain("2 links");
  });

  it("does not flag a single link with ordinary text", () => {
    const result = checkForSpam("Great article, see https://example.com/related for more.");
    expect(result.flagged).toBe(false);
  });

  it("does not flag ordinary, keyword-free text", () => {
    const result = checkForSpam("I really enjoyed this piece, thanks for writing it.");
    expect(result.flagged).toBe(false);
  });

  it("is case-insensitive", () => {
    const result = checkForSpam("VIAGRA for sale");
    expect(result.flagged).toBe(true);
  });
});
