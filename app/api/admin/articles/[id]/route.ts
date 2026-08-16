import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import dbConnect from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth";
import Article from "@/models/Article";
import Comment from "@/models/Comment";
import Reaction from "@/models/Reaction";
import { generateUniqueSlug } from "@/lib/slug";
import { sanitizeArticleHtml } from "@/lib/sanitize";
import { stripHtml } from "@/lib/article-text";
import { getPublishValidationErrors, formatPublishValidationError } from "@/lib/article-publish-validation";
import { SITE_URL as PUBLIC_BASE_URL } from "@/lib/site-config";
import { withDbErrorHandling } from "@/lib/with-db-error-handling";

const updateArticleSchema = z.object({
  title: z.string().min(1).optional(),
  author_name: z.string().min(1).optional(),
  body_html: z.string().optional(),
  body_json: z.unknown().optional(),
  excerpt: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(["draft", "published"]).optional(),
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

async function updateArticle(request: NextRequest, context: RouteContext<"/api/admin/articles/[id]">) {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const parsed = updateArticleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  await dbConnect();

  const existing = await Article.findById(id);
  if (!existing) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  const data = parsed.data;
  const bodyHtml = data.body_html !== undefined ? sanitizeArticleHtml(data.body_html) : undefined;

  // Only gate the act of (re)publishing itself — an ordinary autosave that doesn't
  // touch `status` shouldn't get blocked over this, and shouldn't trigger a
  // revalidation either (`statusChangeRequested` below is what scopes both to the
  // actual publish/republish/unpublish action).
  if (data.status === "published") {
    const missing = getPublishValidationErrors({
      title: data.title ?? existing.title,
      body_html: bodyHtml ?? existing.body_html,
      cover_image: data.cover_image !== undefined ? data.cover_image : existing.cover_image,
    });
    if (missing.length > 0) {
      return NextResponse.json({ error: formatPublishValidationError(missing) }, { status: 400 });
    }
  }

  const wasPublished = existing.status === "published";
  const statusChangeRequested = data.status !== undefined;

  if (data.title !== undefined && data.title !== existing.title) {
    existing.slug = await generateUniqueSlug(data.title, id);
    existing.title = data.title;
  }
  if (data.author_name !== undefined) existing.author_name = data.author_name;
  if (bodyHtml !== undefined) {
    existing.body_html = bodyHtml;
    existing.body_text = stripHtml(bodyHtml);
  }
  if (data.body_json !== undefined) existing.body_json = data.body_json;
  if (data.excerpt !== undefined) existing.excerpt = data.excerpt;
  if (data.tags !== undefined) existing.tags = data.tags;
  if (data.cover_image !== undefined) existing.cover_image = data.cover_image;
  if (data.seo !== undefined) existing.seo = data.seo;
  if (data.status !== undefined && data.status !== existing.status) {
    existing.status = data.status;
    if (data.status === "published" && !existing.published_at) {
      existing.published_at = new Date();
    }
  }

  await existing.save();

  // On-demand ISR: fires for the explicit publish/republish/unpublish action (i.e.
  // whenever this request touches `status`), not on every routine autosave. A
  // revalidation hiccup must never fail the publish itself — the DB write above
  // already succeeded, and the 60s time-based revalidate is the fallback.
  if (statusChangeRequested && (existing.status === "published" || wasPublished)) {
    try {
      revalidatePath(`/articles/${existing.slug}`);
      revalidatePath("/");
    } catch (error) {
      console.error(
        `[articles:${id}] revalidatePath failed after status change to "${existing.status}" — the 60s time-based revalidate will still catch it:`,
        error
      );
    }
  }

  return NextResponse.json({
    article: {
      id: String(existing._id),
      slug: existing.slug,
      title: existing.title,
      author_name: existing.author_name,
      body_html: existing.body_html,
      body_json: existing.body_json,
      excerpt: existing.excerpt ?? "",
      tags: existing.tags,
      status: existing.status,
      cover_image: existing.cover_image ?? null,
      seo: existing.seo ?? null,
      created_at: existing.created_at,
      updated_at: existing.updated_at,
      published_at: existing.published_at ?? null,
      public_url: existing.status === "published" ? `${PUBLIC_BASE_URL}/articles/${existing.slug}` : null,
    },
  });
}

export const PUT = withDbErrorHandling((request: NextRequest, context: RouteContext<"/api/admin/articles/[id]">) => {
  return updateArticle(request, context);
});

export const PATCH = withDbErrorHandling((request: NextRequest, context: RouteContext<"/api/admin/articles/[id]">) => {
  return updateArticle(request, context);
});

export const DELETE = withDbErrorHandling(async (_request: NextRequest, context: RouteContext<"/api/admin/articles/[id]">) => {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  await dbConnect();

  const deleted = await Article.findByIdAndDelete(id);
  if (!deleted) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  await Promise.all([
    Comment.deleteMany({ article_id: id }),
    Reaction.deleteMany({ article_id: id }),
  ]);

  if (deleted.status === "published") {
    try {
      revalidatePath(`/articles/${deleted.slug}`);
      revalidatePath("/");
    } catch (error) {
      console.error(`[articles:${id}] revalidatePath failed after delete:`, error);
    }
  }

  return NextResponse.json({ ok: true });
});
