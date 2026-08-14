import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getServerAuthSession: vi.fn() };
});

import { getServerAuthSession } from "@/lib/auth";
import { GET as publicSearch } from "@/app/api/search/route";
import { GET as adminArticlesList } from "@/app/api/admin/articles/route";
import { connectTestDb, clearDatabase, createTestAdmin, createTestArticle } from "../helpers/db";
import { makeRequest } from "../helpers/request";
import { fakeSession } from "../helpers/fixtures";

const mockSession = vi.mocked(getServerAuthSession);

describe("search", () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
    mockSession.mockReset();
  });

  // T-072 (priority)
  it("public /api/search returns only published articles matching the query, excluding drafts", async () => {
    await createTestArticle({
      title: "Zephyr Cascades",
      slug: "zephyr-cascades-published",
      status: "published",
      body_html: "<p>An essay about zephyr cascades in the mountains.</p>",
    });
    await createTestArticle({
      title: "Zephyr Cascades Draft",
      slug: "zephyr-cascades-draft",
      status: "draft",
      body_html: "<p>A draft essay also about zephyr cascades.</p>",
    });

    const response = await publicSearch(makeRequest("/api/search", { searchParams: { q: "zephyr cascades" } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.articles).toHaveLength(1);
    expect(body.articles[0].slug).toBe("zephyr-cascades-published");
  });

  // T-073
  it("public /api/search 400s on an empty/missing q", async () => {
    const response = await publicSearch(makeRequest("/api/search"));
    expect(response.status).toBe(400);
  });

  // T-074 (priority)
  it("admin article search (GET with q) also matches drafts — no status restriction", async () => {
    const { admin } = await createTestAdmin();
    mockSession.mockResolvedValue(fakeSession(admin.id));
    await createTestArticle({
      title: "Marigold Winters",
      slug: "marigold-winters",
      status: "draft",
      body_html: "<p>A draft essay about marigold winters.</p>",
    });

    const response = await adminArticlesList(makeRequest("/api/admin/articles", { searchParams: { q: "marigold" } }));
    const body = await response.json();
    expect(body.articles.some((a: { title: string }) => a.title === "Marigold Winters")).toBe(true);
  });
});
