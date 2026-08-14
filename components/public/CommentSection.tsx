"use client";

import { useEffect, useRef, useState } from "react";

const NAME_STORAGE_KEY = "naprocs-comment-name";

interface CommentItem {
  id: string;
  author_name: string;
  body: string;
  created_at: string | Date;
}

function formatCommentDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function CommentSection({
  articleId,
  initialComments,
}: {
  articleId: string;
  initialComments: CommentItem[];
}) {
  const [comments, setComments] = useState(initialComments);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "pending-review" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Prefill from a prior visit via a plain DOM mutation (not React state), so
  // there's nothing to reconcile against the server-rendered empty markup —
  // avoids both a hydration mismatch and an unnecessary setState-in-effect.
  useEffect(() => {
    const savedName = localStorage.getItem(NAME_STORAGE_KEY);
    if (savedName && nameRef.current) {
      nameRef.current.value = savedName;
    }
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const authorName = nameRef.current?.value.trim() ?? "";
    const body = bodyRef.current?.value.trim() ?? "";
    if (!authorName || !body) return;

    setStatus("submitting");
    setErrorMessage("");

    try {
      const res = await fetch(`/api/articles/${articleId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author_name: authorName, body }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMessage(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      localStorage.setItem(NAME_STORAGE_KEY, authorName);

      if (data.comment.status === "visible") {
        setComments((prev) => [...prev, data.comment]);
        setJustAddedId(data.comment.id);
        setStatus("idle");
      } else {
        // Flagged by the spam filter — lands in the moderation queue, never
        // rendered here (this list only ever fetches/receives "visible" comments).
        setStatus("pending-review");
      }
      if (bodyRef.current) bodyRef.current.value = "";
    } catch {
      setStatus("error");
      setErrorMessage("Something went wrong. Please try again.");
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="mb-12 space-y-6">
        <div className="relative">
          <input
            ref={nameRef}
            id="name"
            name="author_name"
            type="text"
            required
            maxLength={60}
            placeholder=" "
            className="peer block w-full appearance-none border-0 border-b border-journal-outline-variant bg-transparent px-0 py-2.5 font-article-body text-journal-article-body text-journal-on-surface transition-colors focus:border-journal-primary focus:outline-none focus:ring-0"
          />
          <label
            htmlFor="name"
            className="pointer-events-none absolute left-0 top-2.5 origin-[0] -translate-y-6 scale-75 transform font-ui-label-lg text-journal-secondary uppercase duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-journal-primary"
          >
            Name
          </label>
        </div>
        <div className="relative">
          <textarea
            ref={bodyRef}
            id="comment"
            name="body"
            required
            rows={3}
            maxLength={2000}
            placeholder=" "
            className="peer block w-full resize-none appearance-none border-0 border-b border-journal-outline-variant bg-transparent px-0 py-2.5 font-article-body text-journal-article-body text-journal-on-surface transition-colors focus:border-journal-primary focus:outline-none focus:ring-0"
          />
          <label
            htmlFor="comment"
            className="pointer-events-none absolute left-0 top-2.5 origin-[0] -translate-y-6 scale-75 transform font-ui-label-lg text-journal-secondary uppercase duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-journal-primary"
          >
            Add to the conversation
          </label>
        </div>

        {status === "error" && (
          <p role="alert" className="font-ui-label-md text-journal-ui-label-md text-journal-error">
            {errorMessage}
          </p>
        )}
        {status === "pending-review" && (
          <p className="font-ui-label-md text-journal-ui-label-md text-journal-secondary">
            Thanks — your comment has been submitted and is awaiting review.
          </p>
        )}

        <button
          type="submit"
          disabled={status === "submitting"}
          className="border border-journal-primary px-6 py-3 font-ui-label-lg text-journal-ui-label-lg uppercase tracking-widest text-journal-primary transition-colors duration-200 hover:bg-journal-primary hover:text-journal-on-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "submitting" ? "Submitting..." : "Submit"}
        </button>
      </form>

      {comments.length === 0 ? (
        <p className="font-ui-label-md text-journal-ui-label-md text-journal-secondary">No comments yet.</p>
      ) : (
        <div className="space-y-8">
          {comments.map((comment) => (
            <div key={comment.id} className={`group ${comment.id === justAddedId ? "animate-comment-in" : ""}`}>
              <div className="mb-2 flex items-baseline gap-3">
                <span className="font-ui-label-lg text-journal-ui-label-lg text-journal-primary">
                  {comment.author_name}
                </span>
                <span className="font-ui-meta text-journal-ui-meta text-journal-secondary">
                  {formatCommentDate(comment.created_at)}
                </span>
              </div>
              <p className="font-article-body text-[1rem] leading-relaxed text-journal-on-surface-variant">
                {comment.body}
              </p>
              <div className="mt-6 border-b border-journal-outline-variant opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
