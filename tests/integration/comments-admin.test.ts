import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getServerAuthSession: vi.fn() };
});

import { getServerAuthSession } from "@/lib/auth";
import { GET as listComments, PATCH as patchComment } from "@/app/api/admin/comments/route";
import Article from "@/models/Article";
import Comment from "@/models/Comment";
import { connectTestDb, clearDatabase, createTestAdmin, createTestArticle, createTestComment } from "../helpers/db";
import { makeRequest } from "../helpers/request";
import { fakeSession } from "../helpers/fixtures";

const mockSession = vi.mocked(getServerAuthSession);

describe("admin comments (/api/admin/comments)", () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
    mockSession.mockReset();
  });

  // T-058
  it("GET requires a session", async () => {
    mockSession.mockResolvedValue(null);
    const response = await listComments(makeRequest("/api/admin/comments"));
    expect(response.status).toBe(401);
  });

  // T-059
  it("GET defaults to status=flagged and 400s on an invalid status value", async () => {
    const { admin } = await createTestAdmin();
    mockSession.mockResolvedValue(fakeSession(admin.id));
    const article = await createTestArticle({ status: "published" });
    await createTestComment(String(article._id), { status: "flagged" });
    await createTestComment(String(article._id), { status: "visible" });

    const defaultResponse = await listComments(makeRequest("/api/admin/comments"));
    const defaultBody = await defaultResponse.json();
    expect(defaultBody.comments).toHaveLength(1);
    expect(defaultBody.comments[0].status).toBe("flagged");

    const invalidResponse = await listComments(
      makeRequest("/api/admin/comments", { searchParams: { status: "bogus" } })
    );
    expect(invalidResponse.status).toBe(400);
  });

  // T-059b — "all" returns every status together (the comment-scope expansion that
  // added the admin console's All tab, giving admins a path to retroactively remove an
  // already-visible, auto-approved comment — no such path existed before this).
  it("GET status=all returns comments of every status, with article populated on each", async () => {
    const { admin } = await createTestAdmin();
    mockSession.mockResolvedValue(fakeSession(admin.id));
    const article = await createTestArticle({ status: "published", title: "All-Status Test Article" });
    await createTestComment(String(article._id), { status: "flagged", body: "flagged one" });
    await createTestComment(String(article._id), { status: "visible", body: "visible one" });
    await createTestComment(String(article._id), { status: "removed", body: "removed one" });

    const response = await listComments(makeRequest("/api/admin/comments", { searchParams: { status: "all" } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.comments).toHaveLength(3);
    const statuses = body.comments.map((c: { status: string }) => c.status).sort();
    expect(statuses).toEqual(["flagged", "removed", "visible"]);
    for (const comment of body.comments) {
      expect(comment.article).toEqual({ id: String(article._id), title: "All-Status Test Article", slug: article.slug });
    }
  });

  // T-060 (priority) — the exact Promise.all concurrent-request scenario from audit
  // finding 7.3, now a permanent regression test: two simultaneous PATCH requests
  // moving the same comment to "removed" must decrement comment_count exactly once,
  // not twice, via the compare-and-swap in app/api/admin/comments/route.ts.
  it("two concurrent PATCH requests to remove the same comment decrement comment_count exactly once", async () => {
    const { admin } = await createTestAdmin();
    mockSession.mockResolvedValue(fakeSession(admin.id));
    const article = await createTestArticle({ status: "published" });
    await Article.findByIdAndUpdate(article._id, { comment_count: 1 });
    const comment = await createTestComment(String(article._id), { status: "visible" });

    const [firstResponse, secondResponse] = await Promise.all([
      patchComment(
        makeRequest("/api/admin/comments", {
          method: "PATCH",
          body: { comment_id: String(comment._id), status: "removed" },
        })
      ),
      patchComment(
        makeRequest("/api/admin/comments", {
          method: "PATCH",
          body: { comment_id: String(comment._id), status: "removed" },
        })
      ),
    ]);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);

    const reloadedArticle = await Article.findById(article._id);
    expect(reloadedArticle?.comment_count).toBe(0);
    const reloadedComment = await Comment.findById(comment._id);
    expect(reloadedComment?.status).toBe("removed");
  });

  // T-061
  it("moving a comment back out of 'removed' increments comment_count again", async () => {
    const { admin } = await createTestAdmin();
    mockSession.mockResolvedValue(fakeSession(admin.id));
    const article = await createTestArticle({ status: "published" });
    await Article.findByIdAndUpdate(article._id, { comment_count: 0 });
    const comment = await createTestComment(String(article._id), { status: "removed" });

    const response = await patchComment(
      makeRequest("/api/admin/comments", { method: "PATCH", body: { comment_id: String(comment._id), status: "visible" } })
    );
    expect(response.status).toBe(200);

    const reloadedArticle = await Article.findById(article._id);
    expect(reloadedArticle?.comment_count).toBe(1);
  });

  // T-062
  it("PATCH requires a session", async () => {
    mockSession.mockResolvedValue(null);
    const response = await patchComment(
      makeRequest("/api/admin/comments", { method: "PATCH", body: { comment_id: "000000000000000000000000", status: "removed" } })
    );
    expect(response.status).toBe(401);
  });
});
