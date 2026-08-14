import { describe, it, expect } from "vitest";
import { calculateReadTimeMinutes, truncateAtWordBoundary, deriveExcerpt, stripHtml } from "@/lib/article-text";

// T-093, T-094
describe("calculateReadTimeMinutes", () => {
  it("computes word count / 200wpm, rounded", () => {
    const words = Array(400).fill("word").join(" ");
    expect(calculateReadTimeMinutes(`<p>${words}</p>`)).toBe(2);
  });

  it("returns a minimum of 1 for very short or empty content", () => {
    expect(calculateReadTimeMinutes("<p>hi</p>")).toBe(1);
    expect(calculateReadTimeMinutes("")).toBe(1);
    expect(calculateReadTimeMinutes("<p></p>")).toBe(1);
  });
});

describe("truncateAtWordBoundary", () => {
  it("returns the text unchanged when under the limit", () => {
    expect(truncateAtWordBoundary("short text", 100)).toBe("short text");
  });

  it("cuts at the last space before the limit, never mid-word", () => {
    const text = "The quick brown fox jumps over the lazy dog";
    const result = truncateAtWordBoundary(text, 15);
    expect(result.endsWith("...")).toBe(true);
    expect(result.slice(0, -3).endsWith(" ")).toBe(false);
    // Every whole word in the truncated output must appear intact in the source.
    const words = result.slice(0, -3).trim().split(" ");
    for (const word of words) {
      expect(text).toContain(word);
    }
  });
});

describe("deriveExcerpt", () => {
  it("strips HTML then truncates at a word boundary", () => {
    const html = `<p>${"word ".repeat(50).trim()}</p>`;
    const excerpt = deriveExcerpt(html, 20);
    expect(excerpt).not.toContain("<p>");
    expect(excerpt.length).toBeLessThanOrEqual(23); // 20 + "..."
  });
});

describe("stripHtml", () => {
  it("replaces tags with a single space and collapses whitespace", () => {
    expect(stripHtml("<p>Hello</p><p>World</p>")).toBe("Hello World");
  });
});
