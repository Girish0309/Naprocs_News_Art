import Link from "next/link";
import { AlertTriangle } from "lucide-react";

// Admin-themed counterpart to components/public/DbErrorFallback.tsx — same reasoning
// applies (Next.js redacts thrown Server Component error messages in production, so
// (admin)/error.tsx can't reliably distinguish "DB is down" from any other bug; this
// renders directly from the page instead of throwing to that boundary). Rendered
// inside <AdminShell>, unlike (admin)/error.tsx, since the Server Component calling
// this already has the session in hand — the admin keeps the full console chrome
// (nav, Log Out) instead of landing on a bare error page.
export default function DbErrorFallback({ retryHref }: { retryHref: string }) {
  return (
    // centered empty/error-state message, not a width-bound content container — F2 exception
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-lg py-section-gap text-center">
      <AlertTriangle className="h-10 w-10 text-admin-on-surface-variant" />
      <h1 className="font-display-lg text-admin-display-lg text-admin-primary">Having trouble loading this</h1>
      <p className="max-w-sm font-ui-label-lg text-admin-ui-label-lg text-admin-on-surface-variant">
        We&apos;re having trouble loading this right now — please try again in a moment.
      </p>
      <Link
        href={retryHref}
        className="btn-press rounded-lg bg-admin-primary px-md py-sm font-ui-label-md text-admin-ui-label-md text-admin-on-primary transition-colors hover:bg-admin-surface-tint focus:outline-none focus:ring-2 focus:ring-admin-primary"
      >
        Try again
      </Link>
    </div>
  );
}
