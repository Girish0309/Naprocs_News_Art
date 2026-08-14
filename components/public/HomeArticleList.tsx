"use client";

import { useEffect, useState } from "react";
import { SearchX, BookOpen } from "lucide-react";
import ArticleRow, { type ArticleRowData } from "./ArticleRow";
import { useSearchQuery } from "./SearchQueryContext";

const LIMIT = 6;
const SEARCH_DEBOUNCE_MS = 300;

// Every 3rd row (index 2, 5, 8, ...) uses the text-only "feature" variant, matching
// the mockup's rhythm — its one demo instance is the 3rd article. Reused for search
// results too, so results look like the same listing, not a separate UI.
function variantFor(index: number): "standard" | "feature" {
  return (index + 1) % 3 === 0 ? "feature" : "standard";
}

export default function HomeArticleList({
  initialArticles,
  initialTotal,
}: {
  initialArticles: ArticleRowData[];
  initialTotal: number;
}) {
  const { query } = useSearchQuery();
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [query]);

  // Normal listing state.
  const [articles, setArticles] = useState(initialArticles);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  // Search state — kept separate from the normal listing's so clearing the query just
  // means falling back to whatever the listing already had, no refetch needed. `null`
  // means "no results fetched yet for any query this session" (first search still in
  // flight); once populated, a stale array briefly shows while a newer query's fetch
  // is still in flight, same tradeoff DashboardContent.tsx's admin search already
  // accepts — no separate "loading" flag, since setting one synchronously at the top
  // of this effect is exactly the setState-in-effect pattern that's been a recurring
  // problem elsewhere in this project (Modules 3/5/7); setState only happens inside the
  // fetch's own callbacks here, never at the effect body's top level.
  const [searchResults, setSearchResults] = useState<ArticleRowData[] | null>(null);

  useEffect(() => {
    if (!debouncedQuery) return;

    let ignore = false;
    fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then((res) => (res.ok ? res.json() : { articles: [] }))
      .then((data) => {
        if (ignore) return;
        setSearchResults(data.articles ?? []);
      })
      .catch(() => {
        if (!ignore) setSearchResults([]);
      });
    return () => {
      ignore = true;
    };
  }, [debouncedQuery]);

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

  // Search mode: replaces the listing entirely while a query is active, and falls
  // back to it the moment the query is cleared (debouncedQuery becomes "" again).
  if (debouncedQuery) {
    return (
      <div className="flex w-full max-w-max-reading-width flex-col">
        {searchResults === null ? (
          <p className="border-t border-journal-outline-variant py-8 text-journal-secondary">Searching...</p>
        ) : searchResults.length === 0 ? (
          <div className="flex flex-col items-center gap-3 border-t border-journal-outline-variant py-16 text-center">
            <SearchX className="h-6 w-6 text-journal-secondary" />
            <p className="text-journal-secondary">
              No results for &ldquo;{debouncedQuery}&rdquo;.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {(searchResults ?? []).map((article, index) => (
              <ArticleRow key={article.slug} article={article} variant={variantFor(index)} />
            ))}
          </div>
        )}
      </div>
    );
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
          {articles.map((article, index) => (
            <ArticleRow key={article.slug} article={article} variant={variantFor(index)} />
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
