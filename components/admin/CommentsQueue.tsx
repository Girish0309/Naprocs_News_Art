"use client";

import { useEffect, useRef, useState } from "react";
import { Flag, Check, Trash2 } from "lucide-react";

interface CommentRow {
  id: string;
  author_name: string;
  body: string;
  created_at: string;
  flagged_reason: string | null;
  article: { id: string; title: string; slug: string } | null;
}

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

export default function CommentsQueue() {
  const [comments, setComments] = useState<CommentRow[] | null>(null);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [heights, setHeights] = useState<Record<string, number>>({});
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    fetch("/api/admin/comments?status=flagged")
      .then((res) => res.json())
      .then((data) => setComments(data.comments ?? []));
  }, []);

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
    startRemove(id);
    await fetch("/api/admin/comments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment_id: id, status }),
    });
  }

  const flaggedCount = comments?.length ?? 0;

  return (
    <main className="mx-auto w-full max-w-[1024px] flex-grow p-md transition-all duration-300 md:p-lg lg:p-xl">
      <header className="mb-lg flex items-end justify-between border-b border-admin-outline-variant pb-md">
        <div>
          <h1 className="mb-2 font-display-lg text-admin-display-lg text-admin-primary">Moderation Queue</h1>
          <p className="font-article-body text-admin-article-body text-admin-on-surface-variant">
            Review flagged community interactions.
          </p>
        </div>
        <div className="flex gap-2">
          <span className="flex items-center gap-1 rounded-full border border-admin-error/20 bg-admin-error-container px-2 py-1 font-ui-label-sm text-admin-ui-label-sm text-admin-on-error-container">
            <Flag className="h-[14px] w-[14px]" />
            {flaggedCount} Flagged
          </span>
        </div>
      </header>

      {comments === null && (
        <p className="font-ui-label-md text-admin-ui-label-md text-admin-on-surface-variant">Loading...</p>
      )}

      {comments !== null && comments.length === 0 && (
        <div className="flex flex-col items-center gap-sm rounded-lg border border-admin-outline-variant bg-admin-surface py-xl text-center">
          <Check className="h-6 w-6 text-admin-on-surface-variant" />
          <p className="font-ui-label-md text-admin-ui-label-md text-admin-on-surface-variant">
            No comments waiting for review.
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
                </div>
                {comment.article && (
                  <h3 className="mb-1 font-headline-md text-admin-headline-md text-admin-secondary">
                    {comment.article.title}
                  </h3>
                )}
                <p className="mb-2 line-clamp-3 font-article-body text-admin-article-body text-admin-primary">
                  {comment.body}
                </p>
                {comment.flagged_reason && (
                  <p className="font-ui-label-sm text-admin-ui-label-sm text-admin-error">
                    Flagged: {comment.flagged_reason}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 justify-end gap-2 md:w-32 md:flex-col md:justify-start">
                <button
                  onClick={() => moderate(comment.id, "visible")}
                  aria-label={`Approve comment from ${comment.author_name}`}
                  className="flex w-full items-center justify-center gap-2 rounded border border-admin-outline-variant bg-admin-surface px-4 py-2 font-ui-label-md text-admin-ui-label-md text-admin-primary transition-colors hover:bg-admin-surface-container-high focus:outline-none focus:ring-2 focus:ring-admin-primary"
                >
                  <Check className="h-[18px] w-[18px]" />
                  Approve
                </button>
                <button
                  onClick={() => moderate(comment.id, "removed")}
                  aria-label={`Remove comment from ${comment.author_name}`}
                  className="flex w-full items-center justify-center gap-2 rounded border border-admin-error bg-admin-error px-4 py-2 font-ui-label-md text-admin-ui-label-md text-admin-on-error transition-colors hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-admin-error"
                >
                  <Trash2 className="h-[18px] w-[18px]" />
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
