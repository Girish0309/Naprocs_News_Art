import Article, { type ArticleDocument } from "@/models/Article";
import type { Types } from "mongoose";

export interface RelatedArticleSummary {
  slug: string;
  title: string;
  tags: string[];
  published_at?: Date;
}

/**
 * "More like this": 2-3 published articles sharing a tag, falling back to the most
 * recent other published articles when there's no tag overlap. Extracted out of
 * app/(public)/articles/[slug]/page.tsx (a Server Component, not otherwise callable in
 * isolation) so it has a real, direct unit/integration test surface — see
 * tests/integration/sitemap-and-discoverability.test.ts.
 */
export async function getRelatedArticles(
  article: Pick<ArticleDocument, "tags"> & { _id: Types.ObjectId | string }
): Promise<RelatedArticleSummary[]> {
  let related = await Article.find({
    status: "published",
    _id: { $ne: article._id },
    ...(article.tags.length > 0 ? { tags: { $in: article.tags } } : {}),
  })
    .sort({ published_at: -1 })
    .limit(3)
    .select("slug title tags published_at")
    .lean();

  if (related.length === 0) {
    related = await Article.find({ status: "published", _id: { $ne: article._id } })
      .sort({ published_at: -1 })
      .limit(3)
      .select("slug title tags published_at")
      .lean();
  }

  return related;
}
