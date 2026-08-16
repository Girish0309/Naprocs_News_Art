"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Search, X, Menu } from "lucide-react";
import { useSearchQuery } from "./SearchQueryContext";

const TRANSITION_MS = 300;

const NAV_ITEMS = [
  { href: "/", label: "Essays" },
  { href: "/archive", label: "Archive" },
  { href: "/about", label: "About" },
] as const;

// "/" would match `startsWith` for every path, so the homepage needs an exact check;
// the other two are leaf pages with no nested children, so a prefix check is fine (and
// consistent with AdminShell's own `pathname?.startsWith(href)` convention).
function isNavItemActive(href: string, pathname: string | null): boolean {
  return href === "/" ? pathname === "/" : Boolean(pathname?.startsWith(href));
}

// The exact treatment design-reference/user/homepage.html hardcodes onto "Essays"
// alone (a static mockup has no real routing, so it could only ever show one page's
// state) — generalized here to whichever item is actually current.
function DesktopNav({ pathname }: { pathname: string | null }) {
  return (
    <nav className="hidden gap-8 md:flex">
      {NAV_ITEMS.map(({ href, label }) => {
        const isActive = isNavItemActive(href, pathname);
        return (
          <Link
            key={href}
            href={href}
            className={`border-b-2 pb-1 font-ui-label-lg text-journal-ui-label-lg transition-all duration-150 ${
              isActive
                ? "border-journal-primary text-journal-primary opacity-70"
                : "border-transparent text-journal-secondary transition-colors hover:text-journal-primary"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

// Vertical stack for the drawer — a left-border accent reads more clearly than a
// bottom-underline once links are stacked, the conventional treatment for a vertical
// nav (the same reasoning AdminShell's sidebar applies), built with plain Tailwind
// border utilities and journal-* tokens rather than admin's arbitrary-offset technique
// or its color palette — adapted to this site's own visual language, not copied from it.
function MobileNavLinks({ pathname }: { pathname: string | null }) {
  return (
    <div className="flex flex-1 flex-col gap-2">
      {NAV_ITEMS.map(({ href, label }) => {
        const isActive = isNavItemActive(href, pathname);
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-md border-l-4 px-4 py-3 font-ui-label-lg text-journal-ui-label-lg transition-colors duration-200 ${
              isActive
                ? "border-journal-primary bg-journal-surface-container-low font-semibold text-journal-primary"
                : "border-transparent text-journal-secondary hover:bg-journal-surface-container-low hover:text-journal-primary"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}

export default function SiteHeader() {
  const pathname = usePathname();
  // Two-stage state, matching the mockup's own `hidden` + `-translate-y-full` combo:
  // `mounted` controls whether the bar exists in layout at all (so it can never
  // intercept clicks on the header while collapsed), `open` controls the slide
  // transform. Opening: mount immediately, then slide down on the next tick.
  // Closing: slide up immediately, then unmount after the transition finishes.
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  // Same two-stage pattern for the mobile nav drawer — a separate, independent pair of
  // state so the search overlay and the nav drawer can't be confused for one another.
  const [navMounted, setNavMounted] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);
  const { query, setQuery } = useSearchQuery();
  const inputRef = useRef<HTMLInputElement>(null);

  function openSearch() {
    if (navOpen) closeNav();
    setMounted(true);
    window.setTimeout(() => {
      setOpen(true);
      window.setTimeout(() => inputRef.current?.focus(), 10);
    }, 10);
  }

  function closeSearch() {
    setOpen(false);
    setQuery("");
    window.setTimeout(() => setMounted(false), TRANSITION_MS);
  }

  function openNav() {
    if (open) closeSearch();
    setNavMounted(true);
    window.setTimeout(() => setNavOpen(true), 10);
  }

  function closeNav() {
    setNavOpen(false);
    window.setTimeout(() => setNavMounted(false), TRANSITION_MS);
  }

  // Closes the drawer when the route actually changes (nav-link tap or back/forward)
  // — react.dev's documented "adjusting state during render" pattern, not an effect
  // keyed on [pathname], which would trip react-hooks/set-state-in-effect the same way
  // it did in components/admin/AdminShell.tsx before that fix (see
  // audit/engineering-standards-compliance-report.md §5.3.1) — applied here from the
  // start instead of repeating that mistake.
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setNavOpen(false);
    setNavMounted(false);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (open) closeSearch();
      if (navOpen) closeNav();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, navOpen]);

  function handleSubmit(event: React.FormEvent) {
    // Results already update live as-you-type (debounced, on the homepage) — submit
    // just collapses the bar rather than navigating anywhere.
    event.preventDefault();
    closeSearch();
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-journal-outline-variant bg-journal-surface">
      <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-margin-safe py-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openNav}
            aria-label="Open navigation menu"
            aria-expanded={navOpen}
            className="rounded-full p-2 text-journal-secondary transition-colors hover:bg-journal-surface-container-low hover:text-journal-primary focus:outline-none focus:ring-2 focus:ring-journal-primary md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/" className="flex items-center gap-4 transition-opacity hover:opacity-80">
            <Image src="/logo.png" alt="The Journal Logo" width={40} height={40} className="object-contain" />
            <span className="font-display-lg text-journal-display-lg tracking-tight text-journal-primary">
              The Journal
            </span>
          </Link>
        </div>

        <DesktopNav pathname={pathname} />

        <div className="flex items-center gap-4">
          <button
            aria-label={open ? "Close search" : "Search"}
            aria-expanded={open}
            onClick={() => (open ? closeSearch() : openSearch())}
            className="rounded-full p-2 text-journal-secondary transition-colors hover:bg-journal-surface-container-low hover:text-journal-primary focus:outline-none focus:ring-2 focus:ring-journal-primary"
          >
            <Search className="h-5 w-5" />
          </button>
        </div>
      </div>

      {mounted && (
        <div
          className={`absolute left-0 top-full w-full transform overflow-hidden border-b border-journal-outline-variant bg-journal-surface-container-lowest shadow-sm transition-transform duration-300 ease-in-out ${
            open ? "translate-y-0" : "-translate-y-full"
          }`}
        >
          <form onSubmit={handleSubmit} className="px-margin-safe py-4">
            <div className="mx-auto flex max-w-max-reading-width items-center gap-4">
              <Search className="h-5 w-5 shrink-0 text-journal-secondary" />
              <input
                ref={inputRef}
                type="text"
                aria-label="Search essays, authors, topics"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search essays, authors, topics..."
                className="w-full border-0 border-b border-journal-outline-variant bg-transparent px-0 py-2 font-ui-label-lg text-journal-ui-label-lg text-journal-on-surface outline-none transition-colors placeholder:text-journal-secondary-fixed-dim focus:border-journal-primary focus:ring-0"
              />
              <button
                type="button"
                onClick={closeSearch}
                aria-label="Close search"
                className="shrink-0 rounded-full p-2 text-journal-secondary transition-colors hover:text-journal-primary focus:outline-none focus:ring-2 focus:ring-journal-primary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </form>
        </div>
      )}

      {navMounted && (
        <>
          <div
            onClick={closeNav}
            aria-hidden="true"
            className={`fixed inset-0 z-40 bg-journal-scrim/50 transition-opacity duration-300 ease-in-out md:hidden ${
              navOpen ? "opacity-100" : "opacity-0"
            }`}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className={`fixed left-0 top-0 z-[60] flex h-full w-64 flex-col border-r border-journal-outline-variant bg-journal-surface px-6 py-8 shadow-xl transition-transform duration-300 ease-in-out md:hidden ${
              navOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="mb-8 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Image src="/logo.png" alt="The Journal Logo" width={32} height={32} className="object-contain" />
                <span className="font-display-lg text-journal-display-lg tracking-tight text-journal-primary">
                  The Journal
                </span>
              </div>
              <button
                type="button"
                onClick={closeNav}
                aria-label="Close navigation menu"
                className="rounded-full p-2 text-journal-secondary transition-colors hover:bg-journal-surface-container-low hover:text-journal-primary focus:outline-none focus:ring-2 focus:ring-journal-primary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <MobileNavLinks pathname={pathname} />
          </aside>
        </>
      )}
    </header>
  );
}
