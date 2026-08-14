import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import Admin from "@/models/Admin";
import Article from "@/models/Article";
import { stripHtml } from "@/lib/article-text";
import { E2E_MONGO_URI } from "../global-setup";

// Playwright test files run in a separate Node process from the `next dev` server
// webServer spawns — connecting here via mongoose directly (not through the app's own
// lib/db.ts singleton, which is a different module instance in a different process)
// is the standard way to seed/verify data for E2E specs, matching Module 5's own
// established pattern of hand-writing DB documents for test setup rather than driving
// every single piece of state through the UI.
let connected = false;
async function connect() {
  if (connected) return;
  await mongoose.connect(E2E_MONGO_URI);
  connected = true;
}

export async function seedAdmin(email: string, password: string, name = "E2E Test Admin") {
  await connect();
  await Admin.deleteOne({ email });
  return Admin.create({ name, email, password_hash: await bcrypt.hash(password, 10) });
}

export async function seedPublishedArticle(overrides: { title: string; slug: string; tags?: string[] }) {
  await connect();
  const bodyHtml = `<p>Seeded body content for the E2E public reader flow, article "${overrides.title}".</p>`;
  await Article.deleteOne({ slug: overrides.slug });
  return Article.create({
    title: overrides.title,
    slug: overrides.slug,
    author_name: "E2E Seed Author",
    body_html: bodyHtml,
    body_text: stripHtml(bodyHtml),
    tags: overrides.tags ?? [],
    status: "published",
    published_at: new Date(),
    cover_image: {
      url: "https://res.cloudinary.com/mock/image/upload/e2e-seed-cover.jpg",
      cdn_public_id: "e2e-seed-cover",
      width: 1600,
      height: 1000,
      alt_text: "A seeded cover image for the E2E public flow.",
    },
  });
}
