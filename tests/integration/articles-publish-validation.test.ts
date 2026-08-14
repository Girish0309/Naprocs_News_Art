import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getServerAuthSession: vi.fn() };
});

import { getServerAuthSession } from "@/lib/auth";
import { POST as createArticle } from "@/app/api/admin/articles/route";
import Article from "@/models/Article";
import { connectTestDb, clearDatabase, createTestAdmin } from "../helpers/db";
import { makeRequest } from "../helpers/request";
import { fakeSession } from "../helpers/fixtures";

const mockSession = vi.mocked(getServerAuthSession);

const VALID_COVER_IMAGE = {
  url: "https://res.cloudinary.com/test/image/upload/x.jpg",
  cdn_public_id: "x",
  width: 1600,
  height: 1000,
  alt_text: "A descriptive alt text.",
};

async function publish(body: Record<string, unknown>) {
  return createArticle(makeRequest("/api/admin/articles", { method: "POST", body: { ...body, status: "published" } }));
}

describe("publish validation (POST /api/admin/articles, status: published)", () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
    const { admin } = await createTestAdmin();
    mockSession.mockReset();
    mockSession.mockResolvedValue(fakeSession(admin.id));
  });

  // T-030
  it("rejects a missing title", async () => {
    // title has its own Zod min(1) requirement, so an empty title 400s at the schema
    // layer before publish-validation even runs — still the same user-facing outcome
    // (no publish without a title), verified end to end.
    const response = await publish({ title: "", author_name: "A", body_html: "<p>Body</p>", cover_image: VALID_COVER_IMAGE });
    expect(response.status).toBe(400);
  });

  // T-031
  it("rejects empty/whitespace-only body content", async () => {
    const response = await publish({
      title: "A Title",
      author_name: "A",
      body_html: "<p>   </p>",
      cover_image: VALID_COVER_IMAGE,
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("body content");
  });

  // T-032
  it("rejects a missing cover image", async () => {
    const response = await publish({ title: "A Title", author_name: "A", body_html: "<p>Real content.</p>" });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("a cover image");
  });

  // T-033
  it("rejects a cover image with no alt text", async () => {
    const response = await publish({
      title: "A Title",
      author_name: "A",
      body_html: "<p>Real content.</p>",
      cover_image: { ...VALID_COVER_IMAGE, alt_text: "" },
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("alt text for the cover image");
  });

  // T-034
  it("succeeds with every required field present and sets published_at", async () => {
    const response = await publish({
      title: "A Complete Article",
      author_name: "A",
      body_html: "<p>Real content.</p>",
      cover_image: VALID_COVER_IMAGE,
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    const saved = await Article.findById(body.article.id);
    expect(saved?.status).toBe("published");
    expect(saved?.published_at).toBeInstanceOf(Date);
  });

  // T-035
  it("sanitizes body_html on save, stripping a <script> tag", async () => {
    const response = await createArticle(
      makeRequest("/api/admin/articles", {
        method: "POST",
        body: {
          title: "Draft With Script",
          author_name: "A",
          body_html: "<p>Hello</p><script>alert('xss')</script>",
        },
      })
    );
    const body = await response.json();
    const saved = await Article.findById(body.article.id);
    expect(saved?.body_html).not.toContain("<script>");
    expect(saved?.body_html).toContain("<p>Hello</p>");
  });

  // T-036
  it("allows saving a draft with no cover image or alt text", async () => {
    const response = await createArticle(
      makeRequest("/api/admin/articles", {
        method: "POST",
        body: { title: "Just A Draft", author_name: "A", body_html: "<p>Draft content.</p>" },
      })
    );
    expect(response.status).toBe(201);
  });
});
