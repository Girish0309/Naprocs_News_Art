import { describe, it, expect } from "vitest";
import { sanitizeArticleHtml, sanitizePlainText } from "@/lib/sanitize";

// T-090, T-091, T-092
describe("sanitizeArticleHtml", () => {
  it("strips disallowed tags but keeps allow-listed markup", () => {
    const input = "<p>Hello <script>alert('xss')</script><strong>world</strong></p>";
    const output = sanitizeArticleHtml(input);
    expect(output).not.toContain("<script>");
    expect(output).not.toContain("alert(");
    expect(output).toContain("<strong>world</strong>");
  });

  it("strips disallowed attributes (e.g. onerror) from allowed tags", () => {
    const input = '<img src="https://example.com/a.jpg" onerror="alert(1)" alt="fine">';
    const output = sanitizeArticleHtml(input);
    expect(output).not.toContain("onerror");
    expect(output).toContain('src="https://example.com/a.jpg"');
  });

  it("rewrites link rel to noopener noreferrer nofollow", () => {
    const output = sanitizeArticleHtml('<a href="https://example.com">link</a>');
    expect(output).toContain('rel="noopener noreferrer nofollow"');
  });
});

describe("sanitizePlainText", () => {
  it("strips all markup, keeping only text", () => {
    expect(sanitizePlainText("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
  });

  it("drops <script> tags along with their inner content, not just the tags", () => {
    expect(sanitizePlainText("Before<script>alert('xss')</script>After")).toBe("BeforeAfter");
  });

  it("trims the result", () => {
    expect(sanitizePlainText("  <p>  padded  </p>  ")).toBe("padded");
  });
});
