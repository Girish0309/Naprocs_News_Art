import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getServerAuthSession: vi.fn() };
});

// next/cache's revalidatePath needs a real Next.js request-scoped "static generation
// store" to do anything at all — calling it from a plain Vitest process throws
// ("Invariant: static generation store missing"), which the routes under test already
// catch and log (see their own try/catch — this is the exact scenario T-048 covers).
// Mocked here as a plain vi.fn() so these tests assert WHETHER it was called, and
// (only in T-048) control exactly how it fails, rather than relying on that
// environment-specific invariant error as an implicit stand-in for "it failed."
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { getServerAuthSession } from "@/lib/auth";
import { PATCH as patchArticle, DELETE as deleteArticle } from "@/app/api/admin/articles/[id]/route";
import { connectTestDb, clearDatabase, createTestAdmin, createTestArticle } from "../helpers/db";
import { makeRequest, makeContext } from "../helpers/request";
import { fakeSession } from "../helpers/fixtures";

const mockSession = vi.mocked(getServerAuthSession);

describe("on-demand revalidation on publish/unpublish/delete", () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
    const { admin } = await createTestAdmin();
    mockSession.mockReset();
    mockSession.mockResolvedValue(fakeSession(admin.id));
    revalidatePathMock.mockReset();
    revalidatePathMock.mockImplementation(() => undefined);
  });

  // T-044
  it("publishing a draft revalidates the article path and the homepage", async () => {
    // createTestArticle's default cover_image includes alt_text, so this draft
    // already satisfies publish-validation (Module 3/10) without further setup.
    const article = await createTestArticle({ status: "draft" });

    await patchArticle(
      makeRequest(`/api/admin/articles/${article.id}`, { method: "PATCH", body: { status: "published" } }),
      makeContext({ id: String(article._id) })
    );

    expect(revalidatePathMock).toHaveBeenCalledWith(`/articles/${article.slug}`);
    expect(revalidatePathMock).toHaveBeenCalledWith("/");
  });

  // T-045
  it("unpublishing a published article also revalidates", async () => {
    const article = await createTestArticle({ status: "published" });

    await patchArticle(
      makeRequest(`/api/admin/articles/${article.id}`, { method: "PATCH", body: { status: "draft" } }),
      makeContext({ id: String(article._id) })
    );

    expect(revalidatePathMock).toHaveBeenCalledWith(`/articles/${article.slug}`);
    expect(revalidatePathMock).toHaveBeenCalledWith("/");
  });

  // T-046
  it("deleting a published article revalidates", async () => {
    const article = await createTestArticle({ status: "published" });

    await deleteArticle(
      makeRequest(`/api/admin/articles/${article.id}`, { method: "DELETE" }),
      makeContext({ id: String(article._id) })
    );

    expect(revalidatePathMock).toHaveBeenCalledWith(`/articles/${article.slug}`);
    expect(revalidatePathMock).toHaveBeenCalledWith("/");
  });

  // T-047
  it("an ordinary autosave (no status field) never calls revalidatePath", async () => {
    const article = await createTestArticle({ status: "published" });

    const response = await patchArticle(
      makeRequest(`/api/admin/articles/${article.id}`, { method: "PATCH", body: { body_html: "<p>Edited.</p>" } }),
      makeContext({ id: String(article._id) })
    );

    expect(response.status).toBe(200);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  // T-048
  it("a revalidatePath failure doesn't fail the publish request itself", async () => {
    revalidatePathMock.mockImplementation(() => {
      throw new Error("simulated revalidation failure");
    });
    const article = await createTestArticle({ status: "draft" });

    const response = await patchArticle(
      makeRequest(`/api/admin/articles/${article.id}`, { method: "PATCH", body: { status: "published" } }),
      makeContext({ id: String(article._id) })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.article.status).toBe("published");
  });
});
