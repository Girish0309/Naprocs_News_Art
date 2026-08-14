// Skeleton mirroring the real article layout (hero image, title, byline, body
// paragraphs) — shown only during the brief window before an uncached request's
// data is ready (see the homepage loading.tsx note on ISR making this rare).
export default function ArticleLoading() {
  return (
    <>
      <div className="shimmer-journal relative h-[320px] w-full sm:h-[420px] md:h-[614px] md:max-h-[600px]" />

      <article className="mx-auto max-w-max-reading-width px-gutter pb-section-gap pt-section-gap">
        <div className="mb-12">
          <div className="shimmer-journal mb-6 h-12 w-full rounded" />
          <div className="shimmer-journal mb-6 h-12 w-2/3 rounded" />
          <div className="flex items-center gap-4 border-b border-t border-journal-outline-variant py-3">
            <div className="shimmer-journal h-4 w-32 rounded" />
            <div className="shimmer-journal h-4 w-24 rounded" />
            <div className="shimmer-journal h-4 w-20 rounded" />
          </div>
        </div>

        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="shimmer-journal h-5 w-full rounded" />
          ))}
        </div>
      </article>
    </>
  );
}
