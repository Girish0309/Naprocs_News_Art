import { describe, it, expect } from "vitest";
import { slugify } from "@/lib/slug";

// T-023 (generateUniqueSlug's DB-collision behavior is T-024, an integration test —
// this covers only the pure string transform).
describe("slugify", () => {
  it("lowercases, hyphenates, and strips punctuation", () => {
    expect(slugify("Hello, World! This Is A Test.")).toBe("hello-world-this-is-a-test");
  });

  it("collapses runs of non-alphanumeric characters into a single hyphen", () => {
    expect(slugify("A --- B __ C")).toBe("a-b-c");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify("  --Leading and trailing--  ")).toBe("leading-and-trailing");
  });

  it("caps length at 96 characters", () => {
    const long = "a".repeat(200);
    expect(slugify(long).length).toBe(96);
  });
});
