import type { MetadataRoute } from "next";
import { SITE_URL as BASE_URL } from "@/lib/site-config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /admin/* (the console itself) and /api/* (data endpoints, not content —
      // nothing there is meant to be indexed) are the only disallowed paths.
      // /articles/* and the homepage (including any query string on it, e.g. a
      // bookmarked search) are covered by the bare `allow: "/"` — search doesn't need
      // its own crawlable URL structure for v1, but nothing here actively blocks one
      // if that changes later.
      disallow: ["/admin/", "/api/"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
