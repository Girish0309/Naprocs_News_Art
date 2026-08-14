import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dbConnect from "@/lib/db";
import Admin from "@/models/Admin";
import Article, { type ArticleStatus } from "@/models/Article";
import Comment, { type CommentStatus } from "@/models/Comment";
import Reaction, { type ReactionType } from "@/models/Reaction";
import { stripHtml } from "@/lib/article-text";

/** Connects through the app's real singleton (lib/db.ts) — see global-setup.ts. */
export async function connectTestDb() {
  await dbConnect();
}

/** Drops every document from every collection between tests, keeping indexes intact. */
export async function clearDatabase() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}

let adminCounter = 0;
export async function createTestAdmin(overrides: Partial<{ name: string; email: string; password: string }> = {}) {
  adminCounter += 1;
  const password = overrides.password ?? "CorrectHorseBattery1";
  const admin = await Admin.create({
    name: overrides.name ?? `Test Admin ${adminCounter}`,
    email: overrides.email ?? `admin${adminCounter}@test.local`,
    password_hash: await bcrypt.hash(password, 10),
  });
  return { admin, password };
}

let articleCounter = 0;
export async function createTestArticle(
  overrides: Partial<{
    title: string;
    slug: string;
    author_name: string;
    body_html: string;
    status: ArticleStatus;
    tags: string[];
    cover_image: { url: string; cdn_public_id: string; width: number; height: number; alt_text?: string } | null;
    published_at: Date;
  }> = {}
): Promise<InstanceType<typeof Article>> {
  articleCounter += 1;
  const bodyHtml = overrides.body_html ?? `<p>Body content for test article ${articleCounter}.</p>`;
  const status = overrides.status ?? "published";
  const coverImage =
    overrides.cover_image === undefined
      ? { url: "https://res.cloudinary.com/test/image/upload/cover.jpg", cdn_public_id: "cover", width: 1600, height: 1000, alt_text: "A test cover image." }
      : overrides.cover_image;

  return Article.create({
    title: overrides.title ?? `Test Article ${articleCounter}`,
    slug: overrides.slug ?? `test-article-${articleCounter}`,
    author_name: overrides.author_name ?? "Test Author",
    body_html: bodyHtml,
    body_text: stripHtml(bodyHtml),
    tags: overrides.tags ?? [],
    status,
    cover_image: coverImage ?? undefined,
    published_at: overrides.published_at !== undefined ? overrides.published_at : status === "published" ? new Date() : undefined,
  });
}

export async function createTestComment(
  articleId: string,
  overrides: Partial<{ author_name: string; body: string; status: CommentStatus; fingerprint_hash: string }> = {}
) {
  return Comment.create({
    article_id: articleId,
    author_name: overrides.author_name ?? "A Reader",
    body: overrides.body ?? "A perfectly normal comment.",
    status: overrides.status ?? "visible",
    fingerprint_hash: overrides.fingerprint_hash ?? "test-fingerprint",
  });
}

export async function createTestReaction(articleId: string, fingerprintHash: string, type: ReactionType) {
  return Reaction.create({ article_id: articleId, fingerprint_hash: fingerprintHash, type });
}
