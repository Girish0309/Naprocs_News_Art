import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import Article from "@/models/Article";
import sitemap from "@/app/sitemap";
import { GET as publicArticlesList } from "@/app/api/articles/route";
import ArticlePage, { generateMetadata } from "@/app/(public)/articles/[slug]/page";
import { getRelatedArticles } from "@/lib/related-articles";
import { connectTestDb, clearDatabase, createTestArticle } from "../helpers/db";
import { makeRequest } from "../helpers/request";

/** PageProps<"/articles/[slug]"> requires both params and searchParams promises. */
function pageProps(slug: string) {
  return { params: Promise.resolve({ slug }), searchParams: Promise.resolve({}) };
}

describe("discoverability: drafts stay unreachable on every public surface", () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  // T-078 (priority)
  it("sitemap() includes only published articles", async () => {
    await createTestArticle({ title: "Published One", slug: "published-one", status: "published" });
    await createTestArticle({ title: "Draft One", slug: "draft-one", status: "draft" });

    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls.some((url) => url.endsWith("/articles/published-one"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/articles/draft-one"))).toBe(false);
  });

  // T-079
  it("sitemap() lastModified prefers updated_at over published_at", async () => {
    const published = new Date("2025-01-01T00:00:00.000Z");
    const article = await createTestArticle({
      title: "Edited Article",
      slug: "edited-article",
      status: "published",
      published_at: published,
    });
    // Mongoose's `timestamps: true` schema option (models/Article.ts) overwrites
    // updated_at on every plain .save() — {timestamps: false} is required here to make
    // an explicit past value actually stick, purely to set up this test's fixture.
    const updated = new Date("2025-06-01T00:00:00.000Z");
    await Article.findByIdAndUpdate(article._id, { updated_at: updated }, { timestamps: false });

    const entries = await sitemap();
    const entry = entries.find((e) => e.url.endsWith("/articles/edited-article"));
    expect(entry?.lastModified).toEqual(updated);
  });

  // T-080 (priority)
  it("public GET /api/articles (homepage listing) excludes drafts", async () => {
    await createTestArticle({ title: "Live Article", slug: "live-article", status: "published" });
    await createTestArticle({ title: "Hidden Draft", slug: "hidden-draft", status: "draft" });

    const response = await publicArticlesList(makeRequest("/api/articles"));
    const body = await response.json();
    expect(body.articles.some((a: { slug: string }) => a.slug === "live-article")).toBe(true);
    expect(body.articles.some((a: { slug: string }) => a.slug === "hidden-draft")).toBe(false);
  });

  // T-081 (priority) — /api/articles/[id]/route.ts (public GET-by-slug) is an
  // unimplemented 501 stub (confirmed by reading it), so the REAL public surface for
  // "does a draft's URL resolve" is this Server Component itself.
  it("the real ArticlePage server component throws the notFound() digest for a draft's slug", async () => {
    await createTestArticle({ title: "Secret Draft", slug: "secret-draft", status: "draft" });

    await expect(ArticlePage(pageProps("secret-draft"))).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });

  it("throws the same notFound() digest for a slug that doesn't exist at all", async () => {
    await expect(ArticlePage(pageProps("no-such-slug"))).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });

  // T-082
  it("generateMetadata() for a draft's slug returns {} — no title/description leaked", async () => {
    await createTestArticle({ title: "Should Not Leak", slug: "should-not-leak", status: "draft" });

    const metadata = await generateMetadata(pageProps("should-not-leak"));
    expect(metadata).toEqual({});
  });

  // T-083 (priority)
  it("getRelatedArticles excludes drafts and the current article itself", async () => {
    const current = await createTestArticle({ title: "Current", slug: "current", status: "published", tags: ["tech"] });
    const sameTagPublished = await createTestArticle({
      title: "Same Tag Published",
      slug: "same-tag-published",
      status: "published",
      tags: ["tech"],
    });
    await createTestArticle({ title: "Same Tag Draft", slug: "same-tag-draft", status: "draft", tags: ["tech"] });

    const related = await getRelatedArticles(current);
    const slugs = related.map((r) => r.slug);
    expect(slugs).toContain(sameTagPublished.slug);
    expect(slugs).not.toContain(current.slug);
    expect(slugs).not.toContain("same-tag-draft");
  });

  it("getRelatedArticles falls back to recent published articles when no tag overlap exists", async () => {
    const current = await createTestArticle({ title: "Current", slug: "current-2", status: "published", tags: ["solo-tag"] });
    const other = await createTestArticle({ title: "Unrelated", slug: "unrelated", status: "published", tags: ["other"] });

    const related = await getRelatedArticles(current);
    expect(related.map((r) => r.slug)).toContain(other.slug);
  });
});
