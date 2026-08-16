import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import Article from "@/models/Article";
import { calculateReadTimeMinutes, deriveExcerpt } from "@/lib/article-text";
import { buildArticleTextSearch } from "@/lib/article-search";
import { pageParam, limitParam, boundedTextParam } from "@/lib/query-params";
import { withDbErrorHandling } from "@/lib/with-db-error-handling";

const DEFAULT_LIMIT = 10;

const searchQuerySchema = z.object({
  q: boundedTextParam(200),
  page: pageParam,
  limit: limitParam(DEFAULT_LIMIT, 20),
});

export const GET = withDbErrorHandling(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;
  const parsed = searchQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "A search query is required." }, { status: 400 });
  }
  const { q: query, page, limit } = parsed.data;

  await dbConnect();

  // Same pattern as every other public query (Module 6): status: "published" is part
  // of the query filter itself, not a post-fetch check — a search that happened to
  // match a draft's title/body still can't surface it.
  const { filter, sort, scoreProjection } = buildArticleTextSearch(query, { status: "published" });

  const [articles, total] = await Promise.all([
    Article.find(filter)
      .select({
        slug: 1,
        title: 1,
        author_name: 1,
        excerpt: 1,
        body_html: 1,
        tags: 1,
        cover_image: 1,
        published_at: 1,
        like_count: 1,
        ...scoreProjection,
      })
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Article.countDocuments(filter),
  ]);

  // Same response shape as /api/articles (Module 6's homepage listing) — search
  // results reuse ArticleRow directly, no separate rendering path.
  return NextResponse.json({
    query,
    articles: articles.map((article) => ({
      slug: article.slug,
      title: article.title,
      author_name: article.author_name,
      excerpt: article.excerpt?.trim() || deriveExcerpt(article.body_html),
      tags: article.tags,
      cover_image: article.cover_image ?? null,
      published_at: article.published_at,
      like_count: article.like_count,
      read_time_minutes: calculateReadTimeMinutes(article.body_html),
    })),
    total,
    page,
    limit,
  });
});
