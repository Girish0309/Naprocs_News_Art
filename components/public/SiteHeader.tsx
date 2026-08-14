"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { useSearchQuery } from "./SearchQueryContext";

const TRANSITION_MS = 300;

export default function SiteHeader() {
  // Two-stage state, matching the mockup's own `hidden` + `-translate-y-full` combo:
  // `mounted` controls whether the bar exists in layout at all (so it can never
  // intercept clicks on the header while collapsed), `open` controls the slide
  // transform. Opening: mount immediately, then slide down on the next tick.
  // Closing: slide up immediately, then unmount after the transition finishes.
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const { query, setQuery } = useSearchQuery();
  const inputRef = useRef<HTMLInputElement>(null);

  function openSearch() {
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

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && open) {
        closeSearch();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleSubmit(event: React.FormEvent) {
    // Results already update live as-you-type (debounced, on the homepage) — submit
    // just collapses the bar rather than navigating anywhere.
    event.preventDefault();
    closeSearch();
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-journal-outline-variant bg-journal-surface">
      <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-margin-safe py-4">
        <Link href="/" className="flex items-center gap-4 transition-opacity hover:opacity-80">
          <span className="font-display-lg text-journal-display-lg tracking-tight text-journal-primary">
            The Journal
          </span>
        </Link>
        <nav className="hidden gap-8 md:flex">
          <Link
            href="/"
            className="border-b-2 border-journal-primary pb-1 font-ui-label-lg text-journal-ui-label-lg text-journal-primary opacity-70 transition-all duration-150"
          >
            Essays
          </Link>
          <a
            href="#"
            className="pb-1 font-ui-label-lg text-journal-ui-label-lg text-journal-secondary transition-colors hover:text-journal-primary"
          >
            Archive
          </a>
          <a
            href="#"
            className="pb-1 font-ui-label-lg text-journal-ui-label-lg text-journal-secondary transition-colors hover:text-journal-primary"
          >
            About
          </a>
        </nav>
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
    </header>
  );
}
