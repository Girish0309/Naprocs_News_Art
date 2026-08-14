// Content-area skeleton only — deliberately doesn't try to reproduce AdminShell's
// sidebar (which needs a real session's adminName; loading.tsx renders before that
// lookup resolves, so it can't safely assume one exists yet). The sidebar itself is
// static chrome that doesn't shift, so its absence for this brief window is far less
// noticeable than the content area, which is what's actually still loading.
export default function DashboardLoading() {
  return (
    <main className="mx-auto w-full max-w-container-max flex-1 p-md md:p-lg">
      <div className="mb-lg flex items-center justify-between">
        <div>
          <div className="shimmer mb-2 h-9 w-48 rounded" />
          <div className="shimmer h-5 w-64 rounded" />
        </div>
        <div className="shimmer h-10 w-32 rounded-lg" />
      </div>

      <div className="shimmer mb-md h-10 w-full rounded-lg" />

      <div className="flex flex-col gap-md">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex flex-col gap-2 border-b border-admin-outline-variant py-md">
            <div className="shimmer h-5 w-1/2 rounded" />
            <div className="shimmer h-4 w-3/4 rounded" />
          </div>
        ))}
      </div>
    </main>
  );
}
