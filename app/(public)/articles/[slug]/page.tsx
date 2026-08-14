import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Image from "next/image";
import { Share2, Bookmark } from "lucide-react";
import dbConnect from "@/lib/db";
import Article from "@/models/Article";
import Comment from "@/models/Comment";
import { sanitizeArticleHtml } from "@/lib/sanitize";
import { calculateReadTimeMinutes, truncateAtWordBoundary } from "@/lib/article-text";
import { getRelatedArticles } from "@/lib/related-articles";
import LikeButton from "@/components/public/LikeButton";
import CommentSection from "@/components/public/CommentSection";
import { SITE_NAME, SITE_URL } from "@/lib/site-config";

// SSG with a 60s time-based ISR fallback; the publish action (Module 5) calls
// revalidatePath for this exact path, so it updates on the very next request rather
// than waiting out the full 60s window.
export const revalidate = 60;
const DESCRIPTION_MAX_LENGTH = 155;

function toIsoStringOrUndefined(value: Date | string | undefined | null): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function formatLongDate(value: Date | string): string {
  return new Date(value).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatShortDate(value: Date | string): string {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export async function generateStaticParams() {
  await dbConnect();
  const articles = await Article.find({ status: "published" }).select("slug").lean();
  return articles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata(props: PageProps<"/articles/[slug]">): Promise<Metadata> {
  try {
    const { slug } = await props.params;
    await dbConnect();
    const article = await Article.findOne({ slug, status: "published" })
      .select("title excerpt body_text cover_image published_at updated_at author_name")
      .lean();
    if (!article) return {};

    // Reuses Module 9's body_text (already HTML-stripped) rather than re-stripping
    // body_html here — see truncateAtWordBoundary's own doc comment.
    const description =
      article.excerpt?.trim() || truncateAtWordBoundary(article.body_text ?? "", DESCRIPTION_MAX_LENGTH);
    const url = `${SITE_URL}/articles/${slug}`;
    const imageUrl = article.cover_image?.url;

    return {
      title: article.title,
      description,
      alternates: { canonical: url },
      openGraph: {
        title: article.title,
        description,
        url,
        siteName: SITE_NAME,
        type: "article",
        publishedTime: toIsoStringOrUndefined(article.published_at),
        modifiedTime: toIsoStringOrUndefined(article.updated_at),
        images: imageUrl ? [{ url: imageUrl, alt: article.cover_image?.alt_text }] : undefined,
      },
      twitter: {
        card: "summary_large_image",
        title: article.title,
        description,
        images: imageUrl ? [imageUrl] : undefined,
      },
    };
  } catch (error) {
    // Metadata resolution must never take the whole page down with it — fall back to
    // no page-specific metadata (the (public) layout's defaults still apply) and log
    // for visibility rather than silently swallowing a real bug.
    console.error("[articles/[slug]] generateMetadata failed:", error);
    return {};
  }
}

export default async function ArticlePage(props: PageProps<"/articles/[slug]">) {
  const { slug } = await props.params;

  await dbConnect();
  const article = await Article.findOne({ slug, status: "published" }).lean();

  // Covers both a genuinely missing slug and a slug that exists but is still a
  // draft — neither should ever render, and both look identical from the outside.
  if (!article) {
    notFound();
  }

  // Sanitized again here even though it's sanitized on save (article API routes) —
  // defense in depth. Never trust stored HTML blindly at render time.
  const safeBodyHtml = sanitizeArticleHtml(article.body_html);
  const readTimeMinutes = calculateReadTimeMinutes(article.body_html);

  // Google's Article structured data requires headline, image, and datePublished to
  // be non-empty — all three are structurally guaranteed here already, since publish
  // validation (lib/article-publish-validation.ts) already refuses to publish an
  // article without a title, a cover image, and a set published_at. logo is a
  // placeholder — no real site logo asset exists yet.
  const publishedAtIso = toIsoStringOrUndefined(article.published_at) ?? new Date().toISOString();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    image: article.cover_image?.url ? [article.cover_image.url] : [],
    datePublished: publishedAtIso,
    dateModified: toIsoStringOrUndefined(article.updated_at) ?? publishedAtIso,
    author: { "@type": "Person", name: article.author_name },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.png` },
    },
  };

  // "More like this": 2-3 published articles sharing a tag, falling back to the most
  // recent other published articles when there's no tag overlap — see
  // lib/related-articles.ts (extracted so it has a direct test surface; a Server
  // Component itself isn't independently callable/testable the same way).
  const related = await getRelatedArticles(article);

  const comments = await Comment.find({ article_id: article._id, status: "visible" })
    .sort({ created_at: 1 })
    .select("author_name body created_at")
    .lean();
  const initialComments = comments.map((comment) => ({
    id: String(comment._id),
    author_name: comment.author_name,
    body: comment.body,
    created_at: comment.created_at,
  }));

  return (
    <>
      {/* JSON.stringify doesn't escape HTML — `<` is replaced with its unicode escape
          per Next's own JSON-LD guidance, since title/author_name aren't HTML-sanitized
          (they're not supposed to contain markup) and this uses dangerouslySetInnerHTML. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      {/* A fixed 614px hero on a 375px-wide phone is nearly 2x taller than wide —
          scaled down at mobile/tablet, full size from md+ (Module 12 responsive fix). */}
      {article.cover_image && (
        <div className="relative h-[320px] w-full overflow-hidden bg-journal-surface-container-high sm:h-[420px] md:h-[614px] md:max-h-[600px]">
          <Image
            src={article.cover_image.url}
            alt={article.cover_image.alt_text ?? ""}
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-90 mix-blend-multiply grayscale-[20%]"
          />
        </div>
      )}

      <article className="mx-auto max-w-max-reading-width px-gutter pb-section-gap pt-section-gap">
        <header className="mb-12">
          <h1 className="mb-6 font-display-lg text-journal-display-lg text-journal-primary">{article.title}</h1>
          <div className="flex items-center gap-4 border-b border-t border-journal-outline-variant py-3 font-ui-meta text-journal-ui-meta uppercase tracking-wider text-journal-secondary">
            <span className="font-semibold text-journal-primary">By {article.author_name}</span>
            <span>•</span>
            <span>{article.published_at ? formatLongDate(article.published_at) : ""}</span>
            <span>•</span>
            <span>{readTimeMinutes} min read</span>
          </div>
        </header>

        <div
          className="article-dropcap space-y-6 font-article-body text-journal-article-body [&_blockquote]:my-10 [&_blockquote]:border-l-2 [&_blockquote]:border-journal-primary-container [&_blockquote]:pl-6 [&_blockquote]:font-headline-lg [&_blockquote]:text-journal-headline-lg [&_blockquote]:italic [&_blockquote]:text-journal-primary [&_p]:mb-6"
          dangerouslySetInnerHTML={{ __html: safeBodyHtml }}
        />

        <div className="mt-16 flex items-center justify-between border-t border-journal-outline-variant pt-8">
          <LikeButton articleId={String(article._id)} initialLikeCount={article.like_count} />
          <div className="flex gap-4">
            <button
              aria-label="Share"
              title="Not built yet"
              className="cursor-not-allowed text-journal-secondary transition-colors hover:text-journal-primary"
            >
              <Share2 className="h-5 w-5" />
            </button>
            <button
              aria-label="Bookmark"
              title="Not built yet"
              className="cursor-not-allowed text-journal-secondary transition-colors hover:text-journal-primary"
            >
              <Bookmark className="h-5 w-5" />
            </button>
          </div>
        </div>

        <section className="mt-20">
          <h3 className="mb-8 font-headline-md text-journal-headline-md text-journal-on-surface">Discussion</h3>
          <CommentSection articleId={String(article._id)} initialComments={initialComments} />
        </section>
      </article>

      {related.length > 0 && (
        <section className="mt-12 w-full border-t border-journal-surface-container-highest bg-journal-surface-container-low pb-section-gap pt-16">
          <div className="mx-auto max-w-[1024px] px-margin-safe">
            <h3 className="mb-10 text-center font-headline-md text-journal-headline-md text-journal-on-surface">
              More like this
            </h3>
            <div className="grid grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-2">
              {related.map((item) => (
                <Link key={item.slug} href={`/articles/${item.slug}`} className="group block">
                  <div className="mb-2 font-ui-meta text-journal-ui-meta uppercase text-journal-secondary">
                    {item.tags[0] ?? "Essay"}
                    {item.published_at ? ` • ${formatShortDate(item.published_at)}` : ""}
                  </div>
                  <h4 className="mb-4 line-clamp-2 font-headline-md text-journal-headline-md text-journal-on-surface transition-colors group-hover:text-journal-surface-tint">
                    {item.title}
                  </h4>
                  <div className="border-b border-journal-outline-variant" />
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
