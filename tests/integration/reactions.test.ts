import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

const rateLimitState = vi.hoisted(() => ({ counts: new Map<string, number>() }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async (key: string, limit: number) => {
    const count = (rateLimitState.counts.get(key) ?? 0) + 1;
    rateLimitState.counts.set(key, count);
    return { success: count <= limit, limit, remaining: Math.max(0, limit - count), reset: Date.now() + 60_000 };
  }),
}));

import { GET as getReaction, POST as postReaction } from "@/app/api/articles/[id]/react/route";
import Article from "@/models/Article";
import Reaction from "@/models/Reaction";
import { connectTestDb, clearDatabase, createTestArticle } from "../helpers/db";
import { makeRequest, makeContext } from "../helpers/request";

const FINGERPRINT_HEADERS: Record<string, string> = {
  "x-forwarded-for": "203.0.113.77",
  "user-agent": "reaction-test-agent",
};

async function react(articleId: string, type: "like" | "dislike", headers: Record<string, string> = FINGERPRINT_HEADERS) {
  return postReaction(
    makeRequest(`/api/articles/${articleId}/react`, { method: "POST", headers, body: { type } }),
    makeContext({ id: articleId })
  );
}

describe("reactions (/api/articles/[id]/react)", () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
    rateLimitState.counts.clear();
  });

  // T-063
  it("rejects a forged Origin header", async () => {
    const article = await createTestArticle({ status: "published" });
    const response = await react(String(article._id), "like", { ...FINGERPRINT_HEADERS, origin: "https://evil.example" });
    expect(response.status).toBe(403);
  });

  // T-064
  it("first like creates a reaction and increments like_count", async () => {
    const article = await createTestArticle({ status: "published" });
    const response = await react(String(article._id), "like");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.like_count).toBe(1);
    expect(body.reaction).toBe("like");
  });

  // T-065
  it("the same fingerprint sending like again un-reacts", async () => {
    const article = await createTestArticle({ status: "published" });
    await react(String(article._id), "like");
    const second = await react(String(article._id), "like");
    const body = await second.json();
    expect(body.like_count).toBe(0);
    expect(body.reaction).toBeNull();
  });

  // T-066
  it("switching from dislike to like adjusts both counters in one call", async () => {
    const article = await createTestArticle({ status: "published" });
    await react(String(article._id), "dislike");
    const switched = await react(String(article._id), "like");
    const body = await switched.json();
    expect(body.like_count).toBe(1);
    expect(body.dislike_count).toBe(0);
    expect(body.reaction).toBe("like");
  });

  // T-067
  it("404s against a draft article", async () => {
    const draft = await createTestArticle({ status: "draft" });
    const response = await react(String(draft._id), "like");
    expect(response.status).toBe(404);
  });

  // T-068
  it("is rate-limited after 30 reactions within 15 minutes from the same fingerprint", async () => {
    const article = await createTestArticle({ status: "published" });
    let lastResponse;
    for (let i = 0; i < 31; i++) {
      const type = i % 2 === 0 ? "like" : "dislike";
      lastResponse = await react(String(article._id), type as "like" | "dislike");
    }
    expect(lastResponse!.status).toBe(429);
  });

  // T-069 (priority) — the exact kind of concurrent-race scenario Module 8's report
  // stress-tested manually, now a permanent regression test: many simultaneous
  // `like` clicks from the same fingerprint must resolve to exactly one consistent
  // reaction, never a duplicate-key crash or a 500.
  it("10 concurrent like requests from the same fingerprint resolve to one consistent reaction, no crash", async () => {
    const article = await createTestArticle({ status: "published" });

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => react(String(article._id), "like"))
    );

    for (const response of responses) {
      expect(response.status).toBe(200);
    }

    const reactionCount = await Reaction.countDocuments({ article_id: article._id });
    expect(reactionCount).toBeLessThanOrEqual(1);

    const reloaded = await Article.findById(article._id);
    // Every request alternates the same fingerprint's like on/off; the exact final
    // parity depends on request interleaving, but like_count must never go negative
    // or exceed 1 — a real duplicate/lost-update bug would show up as exactly that.
    expect(reloaded!.like_count).toBeGreaterThanOrEqual(0);
    expect(reloaded!.like_count).toBeLessThanOrEqual(1);
  });

  // T-070
  it("GET reaction state 404s for a draft/nonexistent article", async () => {
    const draft = await createTestArticle({ status: "draft" });
    const response = await getReaction(
      makeRequest(`/api/articles/${draft.id}/react`, { headers: FINGERPRINT_HEADERS }),
      makeContext({ id: String(draft._id) })
    );
    expect(response.status).toBe(404);
  });

  // T-071
  it("GET returns the current reaction and counts for a fingerprint", async () => {
    const article = await createTestArticle({ status: "published" });
    await react(String(article._id), "like");

    const response = await getReaction(
      makeRequest(`/api/articles/${article.id}/react`, { headers: FINGERPRINT_HEADERS }),
      makeContext({ id: String(article._id) })
    );
    const body = await response.json();
    expect(body.reaction).toBe("like");
    expect(body.like_count).toBe(1);
  });
});
