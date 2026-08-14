import type { MetadataRoute } from "next";
import dbConnect from "@/lib/db";
import Article from "@/models/Article";
import { SITE_URL as BASE_URL } from "@/lib/site-config";

// Queries the DB on every request rather than being cached at build time, since
// published articles change independently of deploys.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await dbConnect();

  // status: "published" only (unaffected by Module 9's schema changes — body_text and
  // the text index don't touch this filter) — confirmed against the Module 1-7 audit's
  // item 6.1, which verified the same thing before Module 9 existed.
  const articles = await Article.find({ status: "published" })
    .select("slug published_at updated_at")
    .lean();

  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 1,
    },
    ...articles.map((article) => ({
      url: `${BASE_URL}/articles/${article.slug}`,
      // updated_at, not published_at — a heavily-edited old article should still
      // signal freshness to crawlers, not look stale just because it published long ago.
      lastModified: article.updated_at ?? article.published_at ?? new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
