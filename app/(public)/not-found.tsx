import Link from "next/link";
import { Compass } from "lucide-react";
import { SITE_NAME } from "@/lib/site-config";

// Rendered inside (public)/layout.tsx (header/footer stay mounted) whenever
// notFound() fires from within this route group — e.g. a bad or unpublished
// article slug (app/(public)/articles/[slug]/page.tsx already calls notFound() for
// both a genuinely missing slug and a still-draft one).
export default function PublicNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-gutter py-section-gap text-center">
      <Compass className="h-10 w-10 text-journal-secondary" />
      <h1 className="font-display-lg text-journal-display-lg text-journal-on-surface">Page not found</h1>
      <p className="max-w-md font-article-body text-journal-article-body text-journal-secondary">
        The essay you&apos;re looking for doesn&apos;t exist, or may have been unpublished.
      </p>
      <Link
        href="/"
        className="rounded-full border border-journal-outline px-8 py-3 font-ui-label-lg text-journal-ui-label-lg text-journal-primary transition-colors duration-300 hover:bg-journal-primary-container hover:text-journal-on-primary focus:outline-none focus:ring-2 focus:ring-journal-primary"
      >
        Back to {SITE_NAME}
      </Link>
    </div>
  );
}
