import Link from "next/link";
import { Compass } from "lucide-react";

// Root fallback only — genuinely unmatched URLs that don't belong to either route
// group at all (per Next's own docs: "the root app/not-found.js... handle[s] any
// unmatched URLs for your whole application," regardless of route groups). A
// notFound() thrown from *within* a page is caught by the nearer, styled
// (public)/not-found.tsx or (admin)/not-found.tsx instead (Module 12) — this one
// can't know which "side" of the app a stray URL was even headed toward, so it stays
// deliberately neutral rather than guessing a brand.
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-off-white px-6 text-center text-near-black">
      <Compass className="h-10 w-10 text-near-black/40" />
      <h1 className="font-serif text-3xl">Page not found</h1>
      <p className="max-w-sm text-near-black/70">The page you&apos;re looking for doesn&apos;t exist or may have moved.</p>
      <Link
        href="/"
        className="rounded-md bg-near-black px-4 py-2 font-medium text-off-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-near-black focus:ring-offset-2"
      >
        Return home
      </Link>
    </div>
  );
}
