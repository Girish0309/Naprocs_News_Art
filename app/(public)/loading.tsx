// Skeleton for the homepage's initial article fetch (Module 12) — mirrors
// HomeArticleList's real row shape (image-left/text-right) so the loading state
// feels like part of the same layout, not a generic spinner. Only shows during the
// brief window before the page's own data is ready; ISR (revalidate=60) usually
// means this is rarely seen in practice once a request has been served once.
export default function HomeLoading() {
  return (
    <div className="flex flex-col items-center px-gutter py-section-gap">
      <div className="mb-12 w-full max-w-max-reading-width">
        <div className="shimmer-journal mb-4 h-10 w-64 rounded" />
        <div className="shimmer-journal h-5 w-full max-w-md rounded" />
      </div>

      <div className="flex w-full max-w-max-reading-width flex-col">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="flex flex-col items-start gap-8 border-t border-journal-outline-variant px-4 py-8 md:flex-row"
          >
            <div className="shimmer-journal aspect-[3/2] w-full shrink-0 rounded-md md:w-1/3" />
            <div className="flex w-full flex-col gap-3">
              <div className="shimmer-journal h-4 w-24 rounded" />
              <div className="shimmer-journal h-7 w-3/4 rounded" />
              <div className="shimmer-journal h-4 w-full rounded" />
              <div className="shimmer-journal h-4 w-2/3 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
