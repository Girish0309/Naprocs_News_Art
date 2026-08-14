"use client";

import { createContext, useContext, useState } from "react";

interface SearchQueryContextValue {
  query: string;
  setQuery: (query: string) => void;
}

const SearchQueryContext = createContext<SearchQueryContextValue | null>(null);

// Shared between SiteHeader (owns the search input UI) and the homepage's article
// list (owns swapping the listing for inline results) — they're siblings under
// app/(public)/layout.tsx, not parent/child, so a plain prop can't connect them.
// Holds the RAW, undebounced query; each reader debounces on its own end if it needs
// to (see HomeArticleList), so there's exactly one source of truth for "what's typed."
export function SearchQueryProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = useState("");
  return <SearchQueryContext.Provider value={{ query, setQuery }}>{children}</SearchQueryContext.Provider>;
}

export function useSearchQuery(): SearchQueryContextValue {
  const context = useContext(SearchQueryContext);
  if (!context) {
    throw new Error("useSearchQuery must be used within a SearchQueryProvider");
  }
  return context;
}
