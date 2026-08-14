"use client";

import { useEffect, useState } from "react";
import { ThumbsUp } from "lucide-react";

// The mockup's own like button (design-reference/user/article.html) shows no count at
// all, only a fill/color toggle — a small count display was added here since the
// Module 8 brief explicitly asks for one that pulses on change. Only "like" is wired
// to the UI (the mockup has one button, "Appreciate"); the API and model support
// "dislike" too, but nothing in this design exposes it yet.
export default function LikeButton({
  articleId,
  initialLikeCount,
}: {
  articleId: string;
  initialLikeCount: number;
}) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [pulseKey, setPulseKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Deliberately NOT read server-side in the page component: this article page is
  // SSG'd with a 60s ISR fallback (Module 5), and next/headers' headers() — needed to
  // fingerprint the visitor — opts a route into fully dynamic rendering the moment
  // it's called. Fetching the per-visitor reaction state client-side on mount keeps
  // the page itself static/cacheable and only makes the truly-personalized part
  // (has *this* visitor reacted) a dynamic client request, same as the click itself
  // already is.
  useEffect(() => {
    let ignore = false;
    fetch(`/api/articles/${articleId}/react`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (ignore || !data) return;
        setLiked(data.reaction === "like");
        setLikeCount(data.like_count);
      })
      .catch(() => {
        // Initial state fetch failing just means the button starts in its default
        // (unliked) visual state — clicking it still works normally.
      });
    return () => {
      ignore = true;
    };
  }, [articleId]);

  async function handleClick() {
    if (isSubmitting) return;
    setIsSubmitting(true);

    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount((count) => count + (wasLiked ? -1 : 1));
    setPulseKey((key) => key + 1);

    try {
      const res = await fetch(`/api/articles/${articleId}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "like" }),
      });
      if (!res.ok) throw new Error("react failed");
      const data = await res.json();
      setLiked(data.reaction === "like");
      setLikeCount(data.like_count);
    } catch {
      // Revert the optimistic update — the server never confirmed the change.
      setLiked(wasLiked);
      setLikeCount((count) => count + (wasLiked ? 1 : -1));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      aria-label={liked ? "Unlike this article" : "Like this article"}
      aria-pressed={liked}
      onClick={handleClick}
      disabled={isSubmitting}
      className={`group flex items-center gap-2 border px-4 py-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-journal-primary focus:ring-offset-2 disabled:cursor-wait disabled:opacity-70 ${
        liked
          ? "border-journal-primary-container bg-journal-primary-container text-journal-on-primary-container"
          : "border-journal-primary text-journal-primary hover:bg-journal-primary-container hover:text-journal-on-primary-container"
      }`}
    >
      <ThumbsUp className="h-5 w-5" fill={liked ? "currentColor" : "none"} />
      <span className="font-ui-label-md text-journal-ui-label-md uppercase">Appreciate</span>
      <span key={pulseKey} className="animate-count-pulse font-ui-label-md text-journal-ui-label-md tabular-nums">
        {likeCount}
      </span>
    </button>
  );
}
