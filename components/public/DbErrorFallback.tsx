import Link from "next/link";
import { AlertTriangle } from "lucide-react";

// Rendered directly by a Server Component when a DB call fails with a
// DatabaseConnectionError (lib/db.ts), rather than letting the page throw to the
// generic (public)/error.tsx boundary. Two reasons this is a plain server-rendered
// fallback instead of relying on that boundary: Next.js redacts thrown Server
// Component error messages in production (confirmed in its own docs), so error.tsx
// can't reliably distinguish "DB is down" from any other bug to show this specific,
// more helpful copy; and "try again" here just means "reload," which a plain link can
// do without needing error.tsx's client-side retry() mechanism.
export default function DbErrorFallback({ retryHref }: { retryHref: string }) {
  return (
    // centered empty/error-state message, not a width-bound content container — F2 exception
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-gutter py-section-gap text-center">
      <AlertTriangle className="h-10 w-10 text-journal-secondary" />
      <h1 className="font-display-lg text-journal-display-lg text-journal-on-surface">
        Having trouble loading this
      </h1>
      <p className="max-w-md font-article-body text-journal-article-body text-journal-secondary">
        We&apos;re having trouble loading this right now — please try again in a moment.
      </p>
      <Link
        href={retryHref}
        className="rounded-full border border-journal-primary bg-journal-primary px-8 py-3 font-ui-label-lg text-journal-ui-label-lg text-journal-on-primary transition-colors duration-300 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-journal-primary focus:ring-offset-2"
      >
        Try again
      </Link>
    </div>
  );
}
