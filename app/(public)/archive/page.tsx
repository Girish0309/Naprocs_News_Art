import type { Metadata } from "next";
import dbConnect, { DatabaseConnectionError } from "@/lib/db";
import Article from "@/models/Article";
import { calculateReadTimeMinutes, deriveExcerpt } from "@/lib/article-text";
import ArchiveArticleList from "@/components/public/ArchiveArticleList";
import type { ArticleRowData } from "@/components/public/ArticleRow";
import DbErrorFallback from "@/components/public/DbErrorFallback";
import { SITE_NAME, SITE_URL } from "@/lib/site-config";

// Same SSG + 60s ISR fallback as the homepage (Module 5) — a plain, published-only,
// same-status-filter-discipline query (Module 6's audit item 6.1 applies here too).
export const revalidate = 60;

const PAGE_SIZE = 6;

export const metadata: Metadata = {
  title: "Archive",
  description: `Browse the complete archive of essays from ${SITE_NAME}.`,
  alternates: { canonical: `${SITE_URL}/archive` },
};

export default async function ArchivePage() {
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
      console.error("[archive] failed to load articles:", error);
      return <DbErrorFallback retryHref="/archive" />;
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
        <h1 className="mb-4 font-display-lg text-journal-display-lg text-journal-on-surface">Archive</h1>
        <p className="max-w-2xl font-article-body text-journal-article-body text-journal-secondary">
          Every essay we&apos;ve published, newest first.
        </p>
      </div>

      <ArchiveArticleList initialArticles={initialArticles} initialTotal={total} />
    </div>
  );
}
