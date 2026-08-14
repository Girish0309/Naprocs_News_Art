import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

const rateLimitState = vi.hoisted(() => ({ counts: new Map<string, number>() }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async (key: string, limit: number) => {
    const count = (rateLimitState.counts.get(key) ?? 0) + 1;
    rateLimitState.counts.set(key, count);
    return { success: count <= limit, limit, remaining: Math.max(0, limit - count), reset: Date.now() + 60_000 };
  }),
}));

import { GET as listComments, POST as createComment } from "@/app/api/articles/[id]/comments/route";
import Article from "@/models/Article";
import { connectTestDb, clearDatabase, createTestArticle, createTestComment } from "../helpers/db";
import { makeRequest, makeContext } from "../helpers/request";

describe("public comments (/api/articles/[id]/comments)", () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
    rateLimitState.counts.clear();
  });

  // T-049
  it("GET only returns visible comments, excluding flagged/removed", async () => {
    const article = await createTestArticle({ status: "published" });
    await createTestComment(String(article._id), { status: "visible", body: "Visible one" });
    await createTestComment(String(article._id), { status: "flagged", body: "Flagged one" });
    await createTestComment(String(article._id), { status: "removed", body: "Removed one" });

    const response = await listComments(
      makeRequest(`/api/articles/${article.id}/comments`),
      makeContext({ id: String(article._id) })
    );
    const body = await response.json();
    expect(body.comments).toHaveLength(1);
    expect(body.comments[0].body).toBe("Visible one");
  });

  // T-050 (priority)
  it("POST rejects a forged Origin header", async () => {
    const article = await createTestArticle({ status: "published" });
    const response = await createComment(
      makeRequest(`/api/articles/${article.id}/comments`, {
        method: "POST",
        headers: { origin: "https://evil.example" },
        body: { author_name: "A", body: "Hello" },
      }),
      makeContext({ id: String(article._id) })
    );
    expect(response.status).toBe(403);
  });

  // T-051
  it("POST 404s against a draft article's id", async () => {
    const draft = await createTestArticle({ status: "draft" });
    const response = await createComment(
      makeRequest(`/api/articles/${draft.id}/comments`, { method: "POST", body: { author_name: "A", body: "Hello" } }),
      makeContext({ id: String(draft._id) })
    );
    expect(response.status).toBe(404);
  });

  // T-052
  it("POST 404s against a nonexistent article id", async () => {
    const response = await createComment(
      makeRequest("/api/articles/000000000000000000000000/comments", {
        method: "POST",
        body: { author_name: "A", body: "Hello" },
      }),
      makeContext({ id: "000000000000000000000000" })
    );
    expect(response.status).toBe(404);
  });

  // T-053
  it("POST sanitizes HTML out of the author name and body", async () => {
    const article = await createTestArticle({ status: "published" });
    const response = await createComment(
      makeRequest(`/api/articles/${article.id}/comments`, {
        method: "POST",
        body: { author_name: "<b>Bob</b>", body: "<script>alert(1)</script>Nice post!" },
      }),
      makeContext({ id: String(article._id) })
    );
    const body = await response.json();
    expect(body.comment.author_name).toBe("Bob");
    expect(body.comment.body).toBe("Nice post!");
  });

  // T-054
  it("POST flags a comment containing a spam keyword but still increments comment_count", async () => {
    const article = await createTestArticle({ status: "published" });
    const response = await createComment(
      makeRequest(`/api/articles/${article.id}/comments`, {
        method: "POST",
        body: { author_name: "A", body: "Great deal on viagra here" },
      }),
      makeContext({ id: String(article._id) })
    );
    const body = await response.json();
    expect(body.comment.status).toBe("flagged");

    const reloaded = await Article.findById(article._id);
    expect(reloaded?.comment_count).toBe(1);
  });

  // T-055
  it("POST flags a comment containing more than one link", async () => {
    const article = await createTestArticle({ status: "published" });
    const response = await createComment(
      makeRequest(`/api/articles/${article.id}/comments`, {
        method: "POST",
        body: { author_name: "A", body: "See https://a.example and https://b.example" },
      }),
      makeContext({ id: String(article._id) })
    );
    const body = await response.json();
    expect(body.comment.status).toBe("flagged");
  });

  // T-056
  it("is rate-limited after 5 comments within 15 minutes from the same fingerprint", async () => {
    const article = await createTestArticle({ status: "published" });
    let lastResponse;
    for (let i = 0; i < 6; i++) {
      lastResponse = await createComment(
        makeRequest(`/api/articles/${article.id}/comments`, {
          method: "POST",
          headers: { "x-forwarded-for": "203.0.113.50", "user-agent": "test-agent" },
          body: { author_name: "A", body: `Comment number ${i}` },
        }),
        makeContext({ id: String(article._id) })
      );
    }
    expect(lastResponse!.status).toBe(429);
  });

  // T-057
  it("rejects an empty name/body", async () => {
    const article = await createTestArticle({ status: "published" });
    const response = await createComment(
      makeRequest(`/api/articles/${article.id}/comments`, { method: "POST", body: { author_name: "", body: "" } }),
      makeContext({ id: String(article._id) })
    );
    expect(response.status).toBe(400);
  });
});
