import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/public/SiteHeader";
import { SearchQueryProvider } from "@/components/public/SearchQueryContext";
import { SITE_NAME, SITE_TITLE, SITE_DESCRIPTION } from "@/lib/site-config";

// Applies to every page under this layout (homepage + article pages). Article pages
// override every field via their own generateMetadata (Next replaces, not merges,
// a child's openGraph object — so there's no bleed-through of `type: "website"` below
// into article pages' `type: "article"`); the homepage sets its own explicit metadata
// too (see app/(public)/page.tsx) rather than relying on `default` here implicitly,
// per the Module 10 brief's explicit ask for homepage-level metadata.
export const metadata: Metadata = {
  title: {
    template: `%s | ${SITE_NAME}`,
    default: SITE_TITLE,
  },
  description: SITE_DESCRIPTION,
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-journal-surface font-ui-meta text-journal-on-surface antialiased selection:bg-journal-primary-container selection:text-journal-on-primary-container">
      <SearchQueryProvider>
        <SiteHeader />
        <main className="flex-grow">{children}</main>
      </SearchQueryProvider>
      <footer className="mt-auto w-full border-t border-journal-outline-variant bg-journal-surface">
        <div className="mx-auto flex w-full max-w-max-reading-width flex-col items-center justify-between gap-8 px-margin-safe py-section-gap md:flex-row">
          <p className="font-ui-meta text-journal-ui-meta text-journal-secondary">
            © {new Date().getFullYear()} The Journal Editorial. All rights reserved.
          </p>
          <nav className="flex gap-6">
            <Link
              href="#"
              className="font-ui-meta text-journal-ui-meta uppercase text-journal-on-secondary-container decoration-1 transition-colors hover:text-journal-primary focus:underline"
            >
              Privacy Policy
            </Link>
            <Link
              href="#"
              className="font-ui-meta text-journal-ui-meta uppercase text-journal-on-secondary-container decoration-1 transition-colors hover:text-journal-primary focus:underline"
            >
              Terms of Service
            </Link>
            <Link
              href="#"
              className="font-ui-meta text-journal-ui-meta uppercase text-journal-on-secondary-container decoration-1 transition-colors hover:text-journal-primary focus:underline"
            >
              Contact
            </Link>
            <Link
              href="#"
              className="font-ui-meta text-journal-ui-meta uppercase text-journal-on-secondary-container decoration-1 transition-colors hover:text-journal-primary focus:underline"
            >
              RSS
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
