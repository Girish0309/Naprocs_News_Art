export default async function SearchPage(props: PageProps<"/search">) {
  const { q } = await props.searchParams;

  // TODO: fetch search results (via GET /api/search?q=...) and render them.
  return (
    <div>
      <h1 className="font-serif text-3xl">Search</h1>
      <p className="mt-2 text-near-black/70">
        {q ? `Results for "${q}" go here.` : "Enter a search query."}
      </p>
    </div>
  );
}
