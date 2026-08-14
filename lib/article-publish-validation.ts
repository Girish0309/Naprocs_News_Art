interface PublishCheckInput {
  title?: string;
  body_html?: string;
  cover_image?: { alt_text?: string } | null;
}

function hasVisibleContent(html: string | undefined): boolean {
  return !!html && html.replace(/<[^>]*>/g, "").trim().length > 0;
}

/**
 * Returns a list of missing requirements for publishing, in plain English
 * ("a title", "body content", ...) so callers can build a single clear message.
 * Empty array means the article is ready to publish.
 */
export function getPublishValidationErrors(article: PublishCheckInput): string[] {
  const missing: string[] = [];

  if (!article.title?.trim()) missing.push("a title");
  if (!hasVisibleContent(article.body_html)) missing.push("body content");
  if (!article.cover_image) missing.push("a cover image");
  else if (!article.cover_image.alt_text?.trim()) missing.push("alt text for the cover image");

  return missing;
}

export function formatPublishValidationError(missing: string[]): string {
  return `Add ${missing.join(", ")} before publishing.`;
}
