/**
 * Shared MongoDB $text search query pieces for the Article collection — used by both
 * the public search route (status: "published" only) and the admin articles route
 * (no status restriction, admin can search drafts), so the query logic itself isn't
 * duplicated between them. Ranks by MongoDB's textScore first, with published_at as a
 * tiebreaker (a secondary sort, never overriding relevance).
 */

export interface ArticleTextSearch {
  filter: Record<string, unknown>;
  sort: Record<string, 1 | -1 | { $meta: "textScore" }>;
  /** Merge into whatever field selection the caller needs — required for `sort` above
   * to be able to reference the computed textScore at all. */
  scoreProjection: { score: { $meta: "textScore" } };
}

export function buildArticleTextSearch(query: string, extraFilter: Record<string, unknown> = {}): ArticleTextSearch {
  return {
    filter: { ...extraFilter, $text: { $search: query } },
    sort: { score: { $meta: "textScore" }, published_at: -1 },
    scoreProjection: { score: { $meta: "textScore" } },
  };
}
