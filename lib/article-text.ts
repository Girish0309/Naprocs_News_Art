const WORDS_PER_MINUTE = 200;

/** Shared by read-time/excerpt derivation and by body_text (search index) computation. */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** Word count / 200wpm, rounded, minimum 1 — computed server-side from real body content. */
export function calculateReadTimeMinutes(html: string): number {
  const text = stripHtml(html);
  if (!text) return 1;
  const words = text.split(" ").filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/**
 * Truncates already-plain text at a word boundary (never mid-word), appending "...".
 * Shared by deriveExcerpt (below) and by generateMetadata's description fallback
 * (app/(public)/articles/[slug]/page.tsx), which truncates the stored body_text
 * field directly — never re-strip HTML at read time when a plain-text field already
 * exists for exactly this purpose (see Module 9).
 */
export function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${truncated.slice(0, lastSpace > 0 ? lastSpace : maxLength)}...`;
}

/**
 * Derives a short preview from the real body content when an article has no
 * manually-written excerpt, truncated at a word boundary. Not fabricated copy —
 * just the article's own opening text, trimmed. Takes raw HTML (unlike
 * truncateAtWordBoundary) since not every caller already has a stripped field handy.
 */
export function deriveExcerpt(html: string, maxLength = 160): string {
  return truncateAtWordBoundary(stripHtml(html), maxLength);
}
