import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getServerAuthSession: vi.fn() };
});

import { getServerAuthSession } from "@/lib/auth";
import { GET as listArticles, POST as createArticle } from "@/app/api/admin/articles/route";
import { PATCH as patchArticle, DELETE as deleteArticle } from "@/app/api/admin/articles/[id]/route";
import Article from "@/models/Article";
import Comment from "@/models/Comment";
import Reaction from "@/models/Reaction";
import { connectTestDb, clearDatabase, createTestAdmin, createTestArticle, createTestComment, createTestReaction } from "../helpers/db";
import { makeRequest, makeContext } from "../helpers/request";
import { fakeSession } from "../helpers/fixtures";

const mockSession = vi.mocked(getServerAuthSession);

describe("admin articles CRUD", () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
    mockSession.mockReset();
  });

  // T-021
  it("POST requires a session", async () => {
    mockSession.mockResolvedValue(null);
    const response = await createArticle(
      makeRequest("/api/admin/articles", { method: "POST", body: { title: "x", author_name: "y" } })
    );
    expect(response.status).toBe(401);
  });

  // T-022
  it("POST creates a draft with a generated slug", async () => {
    const { admin } = await createTestAdmin();
    mockSession.mockResolvedValue(fakeSession(admin.id));

    const response = await createArticle(
      makeRequest("/api/admin/articles", {
        method: "POST",
        body: { title: "My First Test Article", author_name: "An Author" },
      })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.article.slug).toBe("my-first-test-article");

    const saved = await Article.findById(body.article.id);
    expect(saved?.status).toBe("draft");
  });

  // T-024
  it("POST with a colliding title gets a -2 suffixed slug", async () => {
    const { admin } = await createTestAdmin();
    mockSession.mockResolvedValue(fakeSession(admin.id));

    const first = await createArticle(
      makeRequest("/api/admin/articles", { method: "POST", body: { title: "Duplicate Title", author_name: "A" } })
    );
    const second = await createArticle(
      makeRequest("/api/admin/articles", { method: "POST", body: { title: "Duplicate Title", author_name: "A" } })
    );

    expect((await first.json()).article.slug).toBe("duplicate-title");
    expect((await second.json()).article.slug).toBe("duplicate-title-2");
  });

  // T-025
  it("PATCH without changing the title leaves the slug unchanged", async () => {
    const { admin } = await createTestAdmin();
    mockSession.mockResolvedValue(fakeSession(admin.id));
    const article = await createTestArticle({ title: "Stable Title", slug: "stable-title", status: "draft" });

    const response = await patchArticle(
      makeRequest(`/api/admin/articles/${article.id}`, { method: "PATCH", body: { author_name: "Someone Else" } }),
      makeContext({ id: String(article._id) })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.article.slug).toBe("stable-title");
  });

  // T-026
  it("PATCH changing the title regenerates a unique slug", async () => {
    const { admin } = await createTestAdmin();
    mockSession.mockResolvedValue(fakeSession(admin.id));
    const article = await createTestArticle({ title: "Old Title", slug: "old-title", status: "draft" });

    const response = await patchArticle(
      makeRequest(`/api/admin/articles/${article.id}`, { method: "PATCH", body: { title: "Brand New Title" } }),
      makeContext({ id: String(article._id) })
    );
    const body = await response.json();
    expect(body.article.slug).toBe("brand-new-title");
  });

  // T-027
  it("DELETE removes the article and cascades its comments and reactions", async () => {
    const { admin } = await createTestAdmin();
    mockSession.mockResolvedValue(fakeSession(admin.id));
    const article = await createTestArticle({ status: "published" });
    await createTestComment(String(article._id));
    await createTestReaction(String(article._id), "fp-1", "like");

    const response = await deleteArticle(
      makeRequest(`/api/admin/articles/${article.id}`, { method: "DELETE" }),
      makeContext({ id: String(article._id) })
    );
    expect(response.status).toBe(200);

    expect(await Article.findById(article._id)).toBeNull();
    expect(await Comment.countDocuments({ article_id: article._id })).toBe(0);
    expect(await Reaction.countDocuments({ article_id: article._id })).toBe(0);
  });

  // T-028
  it("GET filters by status and paginates", async () => {
    const { admin } = await createTestAdmin();
    mockSession.mockResolvedValue(fakeSession(admin.id));

    for (let i = 0; i < 3; i++) {
      await createTestArticle({ title: `Draft ${i}`, slug: `draft-${i}`, status: "draft" });
    }
    for (let i = 0; i < 2; i++) {
      await createTestArticle({ title: `Published ${i}`, slug: `published-${i}`, status: "published" });
    }

    const draftsResponse = await listArticles(
      makeRequest("/api/admin/articles", { searchParams: { status: "draft", page: "1", limit: "2" } })
    );
    const draftsBody = await draftsResponse.json();
    expect(draftsBody.total).toBe(3);
    expect(draftsBody.articles).toHaveLength(2);
    expect(draftsBody.articles.every((a: { status: string }) => a.status === "draft")).toBe(true);

    const publishedResponse = await listArticles(
      makeRequest("/api/admin/articles", { searchParams: { status: "published" } })
    );
    expect((await publishedResponse.json()).total).toBe(2);
  });
});
