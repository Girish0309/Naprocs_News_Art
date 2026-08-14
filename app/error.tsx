"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

// Root fallback only — see the same note in not-found.tsx. A thrown error inside
// (public) or (admin) pages is caught by their own nearer, styled error.tsx (Module
// 12) instead; this one only fires for errors outside both groups (or if one of
// those boundaries itself fails), so it stays brand-neutral.
export default function GlobalError({
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
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-off-white px-6 text-center text-near-black">
      <AlertTriangle className="h-10 w-10 text-near-black/40" />
      <h1 className="font-serif text-3xl">Something went wrong</h1>
      <p className="max-w-sm text-near-black/70">An unexpected error occurred. Please try again.</p>
      <button
        onClick={() => retry()}
        className="rounded-md bg-near-black px-4 py-2 font-medium text-off-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-near-black focus:ring-offset-2"
      >
        Try again
      </button>
    </div>
  );
}
