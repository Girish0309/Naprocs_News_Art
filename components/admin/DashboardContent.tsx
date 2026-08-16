"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, ChevronLeft, ChevronRight, Pencil, MoreVertical, CheckCircle2, FileEdit, FileText } from "lucide-react";

interface ArticleRow {
  id: string;
  title: string;
  excerpt: string;
  status: "draft" | "published";
  author_name: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

type StatusFilter = "all" | "draft" | "published";

const LIMIT = 10;

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

export default function DashboardContent() {
  const router = useRouter();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  // Fetches inline (rather than via a shared callback also invoked from event handlers)
  // per React's recommended data-fetching-in-effects pattern, with an `ignore` guard
  // against race conditions when filters change quickly.
  useEffect(() => {
    let ignore = false;

    async function run() {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (status !== "all") params.set("status", status);
      if (debouncedSearch) params.set("q", debouncedSearch);

      const res = await fetch(`/api/admin/articles?${params.toString()}`);
      if (ignore) return;
      if (res.ok) {
        const data = await res.json();
        if (ignore) return;
        setArticles(data.articles);
        setTotal(data.total);
        setLoadError(null);
      } else {
        // Otherwise the empty state below would say "No articles yet" during a DB
        // outage — a misleading, actively wrong message, not just a missing one.
        setLoadError("Couldn't load articles right now. Please try again in a moment.");
      }
      setLoading(false);
    }

    void run();
    return () => {
      ignore = true;
    };
  }, [status, debouncedSearch, page, refreshKey]);

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this article? This cannot be undone.")) return;
    setDeleteError(null);
    const res = await fetch(`/api/admin/articles/${id}`, { method: "DELETE" });
    if (res.ok) {
      setOpenMenuId(null);
      setRefreshKey((key) => key + 1);
    } else {
      setOpenMenuId(null);
      setDeleteError("Couldn't delete that article. Please try again.");
    }
  }

  const from = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const to = Math.min(page * LIMIT, total);
  const hasNext = to < total;
  const hasPrev = page > 1;

  return (
    <main className="w-full max-w-container-max flex-1 p-md md:p-lg mx-auto">
      <header className="mb-lg flex flex-col items-start justify-between gap-md md:flex-row md:items-center">
        <div>
          <h2 className="font-display-lg text-admin-display-lg text-admin-primary mb-xs">Dashboard</h2>
          <p className="font-ui-label-lg text-admin-ui-label-lg text-admin-on-surface-variant">
            Manage your recent articles and drafts.
          </p>
        </div>
        <Link
          href="/admin/articles/new"
          className="ripple-btn flex items-center gap-sm rounded-lg bg-admin-primary px-md py-sm font-ui-label-md text-admin-ui-label-md text-admin-on-primary transition-colors duration-200 hover:bg-admin-surface-tint"
        >
          <Plus className="h-[18px] w-[18px]" />
          New Article
        </Link>
      </header>

      {deleteError && (
        <p role="alert" className="mb-md font-ui-label-sm text-admin-ui-label-sm text-red-600">
          {deleteError}
        </p>
      )}

      <div className="mb-md flex flex-col items-center justify-between gap-md border-b border-admin-outline-variant pb-md sm:flex-row">
        <div className="flex w-full items-center gap-md sm:w-auto">
          {(["all", "published", "draft"] as const).map((value) => (
            <button
              key={value}
              onClick={() => setStatus(value)}
              className={`pb-sm font-ui-label-md text-admin-ui-label-md transition-colors ${
                status === value
                  ? "border-b-2 border-admin-primary text-admin-primary"
                  : "text-admin-on-surface-variant hover:text-admin-primary"
              }`}
            >
              {value === "all" ? "All" : value === "published" ? "Published" : "Drafts"}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-sm top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-admin-outline" />
          <input
            type="text"
            aria-label="Search articles"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search articles..."
            className="w-full rounded-lg border border-admin-outline-variant bg-admin-surface py-sm pl-xl pr-md font-ui-label-sm text-admin-ui-label-sm text-admin-primary transition-colors focus:border-admin-primary focus:outline-none focus:ring-0"
          />
        </div>
      </div>

      <div className="flex flex-col">
        <div className="hidden grid-cols-12 gap-md border-b border-admin-outline-variant px-md py-sm font-meta-caps text-admin-meta-caps uppercase text-admin-on-surface-variant sm:grid">
          <div className="col-span-6">Title</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Date</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {/* centered empty/error-state message, not a width-bound content container — F2 exception */}
        {!loading && loadError && (
          <div className="flex flex-col items-center gap-sm py-xl text-center">
            <FileText className="h-6 w-6 text-admin-on-surface-variant" />
            <p className="font-ui-label-md text-admin-ui-label-md text-admin-on-surface-variant">{loadError}</p>
          </div>
        )}

        {!loading && !loadError && articles.length === 0 && (
          <div className="flex flex-col items-center gap-sm py-xl text-center">
            <FileText className="h-6 w-6 text-admin-on-surface-variant" />
            <p className="font-ui-label-md text-admin-ui-label-md text-admin-on-surface-variant">
              {debouncedSearch || status !== "all" ? "No articles match your filters." : "No articles yet."}
            </p>
            {!debouncedSearch && status === "all" && (
              <Link href="/admin/articles/new" className="font-ui-label-sm text-admin-ui-label-sm text-admin-primary underline underline-offset-4">
                Write your first article
              </Link>
            )}
          </div>
        )}

        {articles.map((article) => (
          <div
            key={article.id}
            className="row-hover-effect group relative grid cursor-pointer grid-cols-1 gap-md border-b border-admin-outline-variant px-md py-md transition-colors duration-300 spring-ease hover:bg-admin-surface-container-low sm:grid-cols-12"
            onClick={() => router.push(`/admin/articles/${article.id}/edit`)}
          >
            {/* min-w-0 is required here, not decorative — this cell is a CSS Grid item
                (sm:col-span-6 of the row's grid-cols-12), and grid items default to
                min-width: auto (their content's own intrinsic width as a floor), which
                an unbroken long word in the title can exceed. Confirmed live: without
                min-w-0, the cell's *box* still stays correctly track-sized here (thanks
                to Tailwind's grid-cols-N utility using minmax(0,1fr) tracks), but that
                alone doesn't fix anything — the real bug is the title text overflowing
                its own already-correctly-sized box (no break-words), painting straight
                over the status/date columns beside it. min-w-0 is still needed so this
                cell can't silently start actually growing past its track the moment
                anyone changes this row to flexbox or a raw (non-minmax) grid template —
                don't remove it just because it looks unnecessary against a normal title. */}
            <div className="min-w-0 flex flex-col justify-center sm:col-span-6">
              <h3 className="mb-xs break-words font-headline-md text-admin-headline-md text-admin-primary transition-colors group-hover:text-admin-tertiary-container">
                {article.title || "Untitled"}
              </h3>
              <p className="truncate font-ui-label-sm text-admin-ui-label-sm text-admin-on-surface-variant">
                {article.excerpt || "No excerpt yet."}
              </p>
            </div>
            <div className="flex items-center sm:col-span-2">
              {article.status === "published" ? (
                <span className="inline-flex items-center gap-xs rounded bg-admin-primary px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-admin-on-primary">
                  <CheckCircle2 className="h-[12px] w-[12px]" /> Published
                </span>
              ) : (
                <span className="inline-flex items-center gap-xs rounded border border-admin-outline bg-transparent px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-admin-on-surface-variant">
                  <FileEdit className="h-[12px] w-[12px]" /> Draft
                </span>
              )}
            </div>
            <div className="flex items-center sm:col-span-2">
              <span className="font-ui-label-sm text-admin-ui-label-sm text-admin-on-surface-variant">
                {formatDate(article.published_at ?? article.updated_at)}
              </span>
            </div>
            {/* Always visible below md (no hover on touch devices — hover-only reveal
                would make Edit/More-actions unreachable on mobile/tablet); hover-reveal
                stays for md+ where a mouse is more likely present (Module 12). */}
            <div className="relative flex items-center gap-sm opacity-100 transition-opacity duration-200 sm:col-span-2 sm:justify-end md:opacity-0 md:group-hover:opacity-100">
              <Link
                href={`/admin/articles/${article.id}/edit`}
                onClick={(event) => event.stopPropagation()}
                aria-label={`Edit "${article.title || "Untitled"}"`}
                className="rounded text-admin-on-surface-variant transition-colors hover:text-admin-primary focus:outline-none focus:ring-2 focus:ring-admin-primary"
              >
                <Pencil className="h-5 w-5" />
              </Link>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  setOpenMenuId(openMenuId === article.id ? null : article.id);
                }}
                aria-label={`More actions for "${article.title || "Untitled"}"`}
                aria-expanded={openMenuId === article.id}
                className="rounded text-admin-on-surface-variant transition-colors hover:text-admin-primary focus:outline-none focus:ring-2 focus:ring-admin-primary"
              >
                <MoreVertical className="h-5 w-5" />
              </button>
              {openMenuId === article.id && (
                <div
                  onClick={(event) => event.stopPropagation()}
                  className="absolute right-0 top-full z-10 mt-1 w-32 rounded-lg border border-admin-outline-variant bg-admin-surface-bright py-1 shadow-lg"
                >
                  <button
                    onClick={() => handleDelete(article.id)}
                    className="w-full px-sm py-xs text-left font-ui-label-sm text-admin-ui-label-sm text-red-600 hover:bg-admin-surface-container-low focus:outline-none focus:ring-2 focus:ring-inset focus:ring-red-600"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-lg flex items-center justify-between pt-md">
        <span className="font-ui-label-sm text-admin-ui-label-sm text-admin-on-surface-variant">
          {total === 0 ? "No articles" : `Showing ${from} to ${to} of ${total}`}
        </span>
        <div className="flex gap-sm">
          <button
            disabled={!hasPrev}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label="Previous page"
            className="rounded border border-admin-outline-variant px-sm py-xs text-admin-on-surface-variant transition-colors hover:bg-admin-surface-container-low focus:outline-none focus:ring-2 focus:ring-admin-primary disabled:opacity-50"
          >
            <ChevronLeft className="h-[18px] w-[18px]" />
          </button>
          <button
            disabled={!hasNext}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Next page"
            className="rounded border border-admin-outline-variant px-sm py-xs text-admin-primary transition-colors hover:bg-admin-surface-container-low focus:outline-none focus:ring-2 focus:ring-admin-primary disabled:opacity-50 disabled:text-admin-on-surface-variant"
          >
            <ChevronRight className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </main>
  );
}
