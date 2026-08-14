import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth";
import Article from "@/models/Article";
import { generateUniqueSlug } from "@/lib/slug";
import { sanitizeArticleHtml } from "@/lib/sanitize";
import { stripHtml } from "@/lib/article-text";
import { buildArticleTextSearch } from "@/lib/article-search";
import { pageParam, limitParam, boundedTextParam } from "@/lib/query-params";
import { getPublishValidationErrors, formatPublishValidationError } from "@/lib/article-publish-validation";

const listQuerySchema = z.object({
  status: z.enum(["draft", "published"]).optional(),
  q: boundedTextParam(200).optional(),
  page: pageParam,
  limit: limitParam(10, 50),
});

const createArticleSchema = z.object({
  title: z.string().min(1),
  author_name: z.string().min(1),
  body_html: z.string().default(""),
  body_json: z.unknown().optional(),
  excerpt: z.string().optional(),
  tags: z.array(z.string()).default([]),
  status: z.enum(["draft", "published"]).default("draft"),
  cover_image: z
    .object({
      url: z.string(),
      cdn_public_id: z.string(),
      width: z.number(),
      height: z.number(),
      alt_text: z.string().optional(),
    })
    .optional(),
  seo: z
    .object({
      meta_title: z.string().optional(),
      meta_description: z.string().optional(),
    })
    .optional(),
});

export async function GET(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedQuery = listQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsedQuery.success) {
    return NextResponse.json({ error: parsedQuery.error.issues }, { status: 400 });
  }
  const { status, q: query, page, limit } = parsedQuery.data;

  await dbConnect();

  const baseFilter: Record<string, unknown> = {};
  if (status) {
    baseFilter.status = status;
  }

  // No status restriction here (unlike the public search route) — an admin can search
  // drafts too. Reuses the same buildArticleTextSearch() the public route uses, rather
  // than a separate title-only $regex, so admin search covers title/author/tags/body
  // just like the public one does.
  const textSearch = query ? buildArticleTextSearch(query, baseFilter) : null;
  const filter = textSearch?.filter ?? baseFilter;
  const sort = textSearch?.sort ?? { updated_at: -1 };
  const scoreProjection = textSearch?.scoreProjection ?? {};

  const [articles, total] = await Promise.all([
    Article.find(filter)
      .select(scoreProjection)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Article.countDocuments(filter),
  ]);

  return NextResponse.json({
    articles: articles.map((article) => ({
      id: String(article._id),
      title: article.title,
      excerpt: article.excerpt ?? "",
      status: article.status,
      author_name: article.author_name,
      cover_image: article.cover_image ?? null,
      created_at: article.created_at,
      updated_at: article.updated_at,
      published_at: article.published_at ?? null,
    })),
    total,
    page,
    limit,
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createArticleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const data = parsed.data;
  const bodyHtml = sanitizeArticleHtml(data.body_html);
  const bodyText = stripHtml(bodyHtml);

  if (data.status === "published") {
    const missing = getPublishValidationErrors({
      title: data.title,
      body_html: bodyHtml,
      cover_image: data.cover_image,
    });
    if (missing.length > 0) {
      return NextResponse.json({ error: formatPublishValidationError(missing) }, { status: 400 });
    }
  }

  await dbConnect();

  const slug = await generateUniqueSlug(data.title);
  const article = await Article.create({
    ...data,
    body_html: bodyHtml,
    body_text: bodyText,
    slug,
    published_at: data.status === "published" ? new Date() : undefined,
  });

  return NextResponse.json({ article: { id: String(article._id), slug: article.slug } }, { status: 201 });
}
