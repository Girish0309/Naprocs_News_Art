import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "a",
  "ul",
  "ol",
  "li",
  "blockquote",
  "h2",
  "h3",
  "h4",
  "code",
  "pre",
  "img",
];

/**
 * Sanitizes article body HTML from Tiptap's output. Applied both when an article
 * is saved (lib/sanitize.ts used by the admin article API routes) and again when a
 * published article is rendered on the public site — defense in depth, since the
 * render-time pass shouldn't have to trust that every write path sanitized correctly.
 */
export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow" }),
    },
  });
}

/**
 * Strips ALL markup, keeping only text content — used for user-submitted comments,
 * which render as plain text (no rich formatting), unlike article body_html. Tags
 * like <script>/<style> are dropped along with their content; everything else has
 * just its tags removed. Combined with React's default text-escaping at render time,
 * this is defense-in-depth against stored XSS in the comment system.
 */
export function sanitizePlainText(input: string): string {
  return sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} }).trim();
}
