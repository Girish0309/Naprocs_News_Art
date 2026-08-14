"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

// Deliberately NOT wrapped in the full <AdminShell> (unlike this group's
// not-found.tsx): error boundaries must be Client Components, which can't call the
// server-only requireAdminSession()/session lookup AdminShell's adminName needs —
// and more generally, an error boundary should stay maximally simple and
// self-contained, not depend on additional data fetching that could itself fail.
// Still fully on-brand via the same admin-* color/type tokens, just without the
// sidebar chrome.
export default function AdminError({
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
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-admin-background px-lg text-center text-admin-on-background">
      <AlertTriangle className="h-10 w-10 text-admin-on-surface-variant" />
      <h1 className="font-display-lg text-admin-display-lg text-admin-primary">Something went wrong</h1>
      <p className="max-w-sm font-ui-label-lg text-admin-ui-label-lg text-admin-on-surface-variant">
        An unexpected error occurred in the console. Please try again.
      </p>
      <button
        onClick={() => retry()}
        className="btn-press rounded-lg bg-admin-primary px-md py-sm font-ui-label-md text-admin-ui-label-md text-admin-on-primary transition-colors hover:bg-admin-surface-tint focus:outline-none focus:ring-2 focus:ring-admin-primary"
      >
        Try again
      </button>
    </div>
  );
}
