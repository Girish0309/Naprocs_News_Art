import type { Metadata } from "next";
import dbConnect, { DatabaseConnectionError } from "@/lib/db";
import Article from "@/models/Article";
import { calculateReadTimeMinutes, deriveExcerpt } from "@/lib/article-text";
import HomeArticleList from "@/components/public/HomeArticleList";
import type { ArticleRowData } from "@/components/public/ArticleRow";
import DbErrorFallback from "@/components/public/DbErrorFallback";
import { SITE_NAME, SITE_URL, SITE_TITLE, SITE_DESCRIPTION } from "@/lib/site-config";

// SSG with a 60s time-based ISR fallback, on-demand-revalidated on publish (Module 5).
export const revalidate = 60;

const PAGE_SIZE = 6;

// Explicit here (rather than relying on the (public) layout's `default` title/
// description) so the homepage's own SEO/link-preview intent is visible directly in
// this file, matching the Module 10 brief's ask for homepage-level metadata.
export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export default async function HomePage() {
  let articles;
  let total;
  try {
    await dbConnect();

    const filter = { status: "published" as const };
    [articles, total] = await Promise.all([
      Article.find(filter)
        .sort({ published_at: -1 })
        .limit(PAGE_SIZE)
        .select("slug title author_name excerpt body_html tags cover_image published_at like_count")
        .lean(),
      Article.countDocuments(filter),
    ]);
  } catch (error) {
    if (error instanceof DatabaseConnectionError) {
      console.error("[homepage] failed to load articles:", error);
      return <DbErrorFallback retryHref="/" />;
    }
    throw error;
  }

  const initialArticles: ArticleRowData[] = articles.map((article) => ({
    slug: article.slug,
    title: article.title,
    author_name: article.author_name,
    excerpt: article.excerpt?.trim() || deriveExcerpt(article.body_html),
    tags: article.tags,
    cover_image: article.cover_image ?? null,
    published_at: article.published_at ?? null,
    like_count: article.like_count,
    read_time_minutes: calculateReadTimeMinutes(article.body_html),
  }));

  return (
    <div className="flex flex-col items-center px-gutter py-section-gap">
      <div className="mb-12 w-full max-w-max-reading-width">
        <h1 className="mb-4 font-display-lg text-journal-display-lg text-journal-on-surface">Perspectives</h1>
        <p className="max-w-2xl font-article-body text-journal-article-body text-journal-secondary">
          Exploring thought, culture, and the art of modern narrative. A curated selection of long-form writing.
        </p>
      </div>

      <HomeArticleList initialArticles={initialArticles} initialTotal={total} />
    </div>
  );
}
