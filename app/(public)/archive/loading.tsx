// Mirrors HomeLoading's shimmer treatment (Module 12) so the (public)/loading.tsx
// fallback — which would otherwise apply here too, shaped like the homepage — doesn't
// show a mismatched skeleton while this route's own data streams in.
export default function ArchiveLoading() {
  return (
    <div className="flex flex-col items-center px-gutter py-section-gap">
      <div className="mb-12 w-full max-w-max-reading-width">
        <div className="shimmer-journal mb-4 h-10 w-40 rounded" />
        <div className="shimmer-journal h-5 w-full max-w-md rounded" />
      </div>

      <div className="flex w-full max-w-max-reading-width flex-col">
        {Array.from({ length: 6 }).map((_, index) => (
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
