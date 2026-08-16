"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Flag, Check, Trash2, RotateCcw, MessagesSquare } from "lucide-react";

type CommentStatus = "visible" | "flagged" | "removed";

interface CommentRow {
  id: string;
  author_name: string;
  body: string;
  status: CommentStatus;
  created_at: string;
  flagged_reason: string | null;
  article: { id: string; title: string; slug: string } | null;
}

type FilterTab = "flagged" | "all";

function timeAgo(value: string): string {
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// Which action(s) make sense depends on the comment's own current status — approving
// an already-visible comment or removing an already-removed one are both no-ops the UI
// shouldn't offer. "Restore" reuses the exact same PATCH-to-"visible" transition
// Approve already used (see app/api/admin/comments/route.ts's compare-and-swap, and
// its own T-061 regression test for this exact transition) — same capability, framed
// for the direction it's actually being used in here.
function CommentActions({
  comment,
  onModerate,
}: {
  comment: CommentRow;
  onModerate: (id: string, status: "visible" | "removed") => void;
}) {
  const approveButton = (
    <button
      key="approve"
      onClick={() => onModerate(comment.id, "visible")}
      aria-label={`Approve comment from ${comment.author_name}`}
      className="flex w-full items-center justify-center gap-2 rounded border border-admin-outline-variant bg-admin-surface px-4 py-2 font-ui-label-md text-admin-ui-label-md text-admin-primary transition-colors hover:bg-admin-surface-container-high focus:outline-none focus:ring-2 focus:ring-admin-primary"
    >
      <Check className="h-[18px] w-[18px]" />
      Approve
    </button>
  );
  const restoreButton = (
    <button
      key="restore"
      onClick={() => onModerate(comment.id, "visible")}
      aria-label={`Restore comment from ${comment.author_name}`}
      className="flex w-full items-center justify-center gap-2 rounded border border-admin-outline-variant bg-admin-surface px-4 py-2 font-ui-label-md text-admin-ui-label-md text-admin-primary transition-colors hover:bg-admin-surface-container-high focus:outline-none focus:ring-2 focus:ring-admin-primary"
    >
      <RotateCcw className="h-[18px] w-[18px]" />
      Restore
    </button>
  );
  const removeButton = (
    <button
      key="remove"
      onClick={() => onModerate(comment.id, "removed")}
      aria-label={`Remove comment from ${comment.author_name}`}
      className="flex w-full items-center justify-center gap-2 rounded border border-admin-error bg-admin-error px-4 py-2 font-ui-label-md text-admin-ui-label-md text-admin-on-error transition-colors hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-admin-error"
    >
      <Trash2 className="h-[18px] w-[18px]" />
      Remove
    </button>
  );

  if (comment.status === "flagged") return <>{approveButton}{removeButton}</>;
  if (comment.status === "visible") return <>{removeButton}</>;
  return <>{restoreButton}</>;
}

export default function CommentsQueue() {
  const [filter, setFilter] = useState<FilterTab>("flagged");
  const [prevFilter, setPrevFilter] = useState<FilterTab>(filter);
  const [comments, setComments] = useState<CommentRow[] | null>(null);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Resets to the loading state the instant the tab changes, so switching Flagged/All
  // never briefly shows the previous tab's stale list — react.dev's "adjusting state
  // during render" pattern, the same one used for AdminShell.tsx/SiteHeader.tsx's
  // route-change resets (audit/engineering-standards-compliance-report.md §5.3.1), not
  // a `useEffect(() => setComments(null), [filter])`, which trips
  // react-hooks/set-state-in-effect the same way that one did.
  if (filter !== prevFilter) {
    setPrevFilter(filter);
    setComments(null);
  }

  function loadQueue(activeFilter: FilterTab) {
    fetch(`/api/admin/comments?status=${activeFilter}`)
      .then(async (res) => {
        if (!res.ok) {
          // Otherwise this falls through to `data.comments ?? []` and renders the
          // same "nothing here" empty state the list shows when it's genuinely
          // empty — actively misleading during a real load failure.
          setErrorMessage("Couldn't load comments right now. Please try again in a moment.");
          setComments([]);
          return;
        }
        const data = await res.json();
        setErrorMessage(null);
        setComments(data.comments ?? []);
      })
      .catch(() => {
        setErrorMessage("Couldn't load comments right now. Please try again in a moment.");
        setComments([]);
      });
  }

  useEffect(() => {
    loadQueue(filter);
  }, [filter]);

  function startRemove(id: string) {
    const el = rowRefs.current.get(id);
    if (el) {
      setHeights((prev) => ({ ...prev, [id]: el.offsetHeight }));
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setRemovingIds((prev) => new Set(prev).add(id));
        });
      });
    } else {
      setRemovingIds((prev) => new Set(prev).add(id));
    }
    window.setTimeout(() => {
      setComments((prev) => prev?.filter((comment) => comment.id !== id) ?? null);
    }, 320);
  }

  async function moderate(id: string, status: "visible" | "removed") {
    setErrorMessage(null);
    // On the Flagged tab, every visible row IS "flagged" — any action here always
    // means leaving that filtered view, so it animates out. On the All tab, nothing
    // is filtered by status, so moderating just updates the row's own status/actions
    // in place instead of removing it from the list.
    if (filter === "flagged") {
      startRemove(id);
    } else {
      setComments((prev) => prev?.map((c) => (c.id === id ? { ...c, status, flagged_reason: null } : c)) ?? null);
    }
    try {
      const res = await fetch("/api/admin/comments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment_id: id, status }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Whichever path was taken above already applied optimistically — reload from
      // the server rather than leave the list showing a moderation action that never
      // actually landed.
      setErrorMessage("Couldn't save that — the list has been refreshed. Please try again.");
      loadQueue(filter);
    }
  }

  const count = comments?.length ?? 0;

  return (
    <main className="mx-auto w-full max-w-[1024px] flex-grow p-md transition-all duration-300 md:p-lg lg:p-xl">
      <header className="mb-lg flex items-end justify-between border-b border-admin-outline-variant pb-md">
        <div>
          <h1 className="mb-2 font-display-lg text-admin-display-lg text-admin-primary">Comments</h1>
          <p className="font-article-body text-admin-article-body text-admin-on-surface-variant">
            {filter === "flagged" ? "Review flagged community interactions." : "Browse every comment across your articles."}
          </p>
        </div>
        <div className="flex gap-2">
          {filter === "flagged" ? (
            <span className="flex items-center gap-1 rounded-full border border-admin-error/20 bg-admin-error-container px-2 py-1 font-ui-label-sm text-admin-ui-label-sm text-admin-on-error-container">
              <Flag className="h-[14px] w-[14px]" />
              {count} Flagged
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full border border-admin-outline-variant bg-admin-surface-container-high px-2 py-1 font-ui-label-sm text-admin-ui-label-sm text-admin-on-surface-variant">
              <MessagesSquare className="h-[14px] w-[14px]" />
              {count} Comment{count === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </header>

      <div className="mb-lg flex items-center gap-md border-b border-admin-outline-variant">
        {(["flagged", "all"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`pb-sm font-ui-label-md text-admin-ui-label-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-admin-primary ${
              filter === tab
                ? "border-b-2 border-admin-primary text-admin-primary"
                : "text-admin-on-surface-variant hover:text-admin-primary"
            }`}
          >
            {tab === "flagged" ? "Flagged" : "All"}
          </button>
        ))}
      </div>

      {errorMessage && (
        <p role="alert" className="mb-md font-ui-label-sm text-admin-ui-label-sm text-red-600">
          {errorMessage}
        </p>
      )}

      {comments === null && (
        <p className="font-ui-label-md text-admin-ui-label-md text-admin-on-surface-variant">Loading...</p>
      )}

      {comments !== null && comments.length === 0 && (
        <div className="flex flex-col items-center gap-sm rounded-lg border border-admin-outline-variant bg-admin-surface py-xl text-center">
          <Check className="h-6 w-6 text-admin-on-surface-variant" />
          <p className="font-ui-label-md text-admin-ui-label-md text-admin-on-surface-variant">
            {filter === "flagged" ? "No comments waiting for review." : "No comments have been posted yet."}
          </p>
        </div>
      )}

      {comments !== null && comments.length > 0 && (
        <div className="flex flex-col gap-0 overflow-hidden rounded-lg border border-admin-outline-variant bg-admin-surface">
          {comments.map((comment, index) => (
            <div
              key={comment.id}
              ref={(el) => {
                if (el) rowRefs.current.set(comment.id, el);
                else rowRefs.current.delete(comment.id);
              }}
              style={heights[comment.id] !== undefined ? { height: `${heights[comment.id]}px` } : undefined}
              className={`comment-row group relative flex flex-col gap-4 p-md transition-colors duration-300 hover:bg-admin-surface-container-low md:flex-row ${
                index < comments.length - 1 ? "border-b border-admin-outline-variant" : ""
              } ${removingIds.has(comment.id) ? "removing" : ""}`}
            >
              <div className="flex-grow">
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-ui-label-lg text-admin-ui-label-lg text-admin-primary">
                    {comment.author_name}
                  </span>
                  <span className="font-ui-label-sm text-admin-ui-label-sm text-admin-on-surface-variant">
                    • {timeAgo(comment.created_at)}
                  </span>
                  {filter === "all" && comment.status !== "flagged" && (
                    <span
                      className={`rounded-full px-2 py-0.5 font-ui-label-sm text-admin-ui-label-sm ${
                        comment.status === "removed"
                          ? "bg-admin-error-container text-admin-on-error-container"
                          : "bg-admin-surface-container-high text-admin-on-surface-variant"
                      }`}
                    >
                      {comment.status === "removed" ? "Removed" : "Visible"}
                    </span>
                  )}
                </div>
                {/* Which article a comment belongs to must always be visible here, not
                    just when reviewing one flagged item in isolation — essential once
                    "All" mixes comments from every article together. */}
                {comment.article ? (
                  <Link
                    href={`/admin/articles/${comment.article.id}/edit`}
                    className="mb-1 inline-block font-headline-md text-admin-headline-md text-admin-secondary transition-colors hover:text-admin-primary focus:outline-none focus-visible:underline"
                  >
                    {comment.article.title || "Untitled"}
                  </Link>
                ) : (
                  <p className="mb-1 font-headline-md text-admin-headline-md text-admin-on-surface-variant opacity-60">
                    Article no longer available
                  </p>
                )}
                <p className="mb-2 line-clamp-3 break-words font-article-body text-admin-article-body text-admin-primary">
                  {comment.body}
                </p>
                {comment.flagged_reason && (
                  <p className="font-ui-label-sm text-admin-ui-label-sm text-admin-error">
                    Flagged: {comment.flagged_reason}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 justify-end gap-2 md:w-32 md:flex-col md:justify-start">
                <CommentActions comment={comment} onModerate={moderate} />
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
