"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function PublicError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-gutter py-section-gap text-center">
      <AlertTriangle className="h-10 w-10 text-journal-secondary" />
      <h1 className="font-display-lg text-journal-display-lg text-journal-on-surface">Something went wrong</h1>
      <p className="max-w-md font-article-body text-journal-article-body text-journal-secondary">
        We hit a snag loading this page. Please try again.
      </p>
      <button
        onClick={() => retry()}
        className="rounded-full border border-journal-primary bg-journal-primary px-8 py-3 font-ui-label-lg text-journal-ui-label-lg text-journal-on-primary transition-colors duration-300 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-journal-primary focus:ring-offset-2"
      >
        Try again
      </button>
    </div>
  );
}
