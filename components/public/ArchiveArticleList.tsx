"use client";

import { useState } from "react";
import { BookOpen } from "lucide-react";
import ArticleRow, { type ArticleRowData } from "./ArticleRow";

// Matches /api/articles's own DEFAULT_LIMIT and the homepage's pagination step, so
// "Load More" feels identical across both listings.
const LIMIT = 6;

// A small, independent sibling of HomeArticleList rather than a shared component —
// that component's pagination state is intertwined with SearchQueryContext (Module 9),
// which isn't relevant here (the Archive is a plain chronological browse, not a search
// surface), and factoring it out would mean touching a working, already-audited
// component for no real gain. Some duplication of the load-more logic is the
// deliberate tradeoff.
export default function ArchiveArticleList({
  initialArticles,
  initialTotal,
}: {
  initialArticles: ArticleRowData[];
  initialTotal: number;
}) {
  const [articles, setArticles] = useState(initialArticles);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    setLoading(true);
    try {
      const nextPage = page + 1;
      const res = await fetch(`/api/articles?page=${nextPage}&limit=${LIMIT}`);
      if (res.ok) {
        const data = await res.json();
        setArticles((prev) => [...prev, ...data.articles]);
        setTotal(data.total);
        setPage(nextPage);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full max-w-max-reading-width flex-col">
      {articles.length === 0 ? (
        <div className="flex flex-col items-center gap-3 border-t border-journal-outline-variant py-16 text-center">
          <BookOpen className="h-6 w-6 text-journal-secondary" />
          <p className="text-journal-secondary">No essays published yet. Check back soon.</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {/* Always the "standard" row variant, unlike the homepage's every-3rd "feature"
              rhythm — the Archive's job is scanning the full catalog quickly, not editorial
              pacing, so a uniform row shape suits it better. */}
          {articles.map((article) => (
            <ArticleRow key={article.slug} article={article} variant="standard" />
          ))}
        </div>
      )}

      {articles.length < total && (
        <div className="mt-12 flex justify-center py-8">
          <button
            onClick={loadMore}
            disabled={loading}
            className="rounded-full border border-journal-outline px-8 py-3 font-ui-label-lg text-journal-ui-label-lg text-journal-primary transition-colors duration-300 hover:bg-journal-primary-container hover:text-journal-on-primary disabled:opacity-50"
          >
            {loading ? "Loading..." : "Load More Essays"}
          </button>
        </div>
      )}
    </div>
  );
}
