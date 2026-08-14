import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { requireAdminSession } from "@/lib/auth";
import AdminShell from "@/components/admin/AdminShell";

// Rendered whenever notFound() fires from within the (admin) route group — e.g. a
// bad/deleted article ID in the editor URL
// (app/(admin)/admin/articles/[id]/edit/page.tsx already calls notFound() for both
// an invalid ObjectId and a genuinely missing article). requireAdminSession() here is
// a defensive, redundant-but-harmless re-check, not a new auth gate: proxy.ts already
// requires a valid session for every /admin/* request before this ever renders, so
// reaching this page at all means the visitor is already an authenticated admin —
// safe to show the full console shell (sidebar nav, "The Editorial" chrome) rather
// than a bare page, so 404 still feels like part of the same console.
export default async function AdminNotFound() {
  const session = await requireAdminSession();

  return (
    <AdminShell adminName={session.user.name}>
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-lg text-center">
        <FileQuestion className="h-10 w-10 text-admin-on-surface-variant" />
        <h1 className="font-display-lg text-admin-display-lg text-admin-primary">Not found</h1>
        <p className="max-w-sm font-ui-label-lg text-admin-ui-label-lg text-admin-on-surface-variant">
          That article — or page — doesn&apos;t exist, or may have been deleted.
        </p>
        <Link
          href="/admin/dashboard"
          className="btn-press rounded-lg bg-admin-primary px-md py-sm font-ui-label-md text-admin-ui-label-md text-admin-on-primary transition-colors hover:bg-admin-surface-tint focus:outline-none focus:ring-2 focus:ring-admin-primary"
        >
          Back to Dashboard
        </Link>
      </main>
    </AdminShell>
  );
}
