import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import Article from "@/models/Article";
import { calculateReadTimeMinutes, deriveExcerpt } from "@/lib/article-text";
import { pageParam, limitParam, boundedTextParam } from "@/lib/query-params";
import { withDbErrorHandling } from "@/lib/with-db-error-handling";

const DEFAULT_LIMIT = 6;

const querySchema = z.object({
  tag: boundedTextParam(100).optional(),
  page: pageParam,
  limit: limitParam(DEFAULT_LIMIT, 20),
});

export const GET = withDbErrorHandling(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const { tag, page, limit } = parsed.data;

  await dbConnect();

  const filter: Record<string, unknown> = { status: "published" };
  if (tag) filter.tags = tag;

  const [articles, total] = await Promise.all([
    Article.find(filter)
      .sort({ published_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("slug title author_name excerpt body_html tags cover_image published_at like_count")
      .lean(),
    Article.countDocuments(filter),
  ]);

  return NextResponse.json({
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
