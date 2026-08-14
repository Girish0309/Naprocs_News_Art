import dbConnect from "../lib/db";
import Article from "../models/Article";
import { stripHtml } from "../lib/article-text";

// One-time migration: computes body_text (HTML-stripped plaintext, used by the search
// text index — see models/Article.ts) for every article that existed before this
// field did. New/edited articles get body_text written inline by the admin article
// routes going forward; this just catches up whatever was already in the DB.
async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No .env.local present — assume env vars are already set in the shell.
  }

  await dbConnect();

  const articles = await Article.find({}).select("_id body_html").lean();
  console.log(`Found ${articles.length} article(s).`);

  let updated = 0;
  for (const article of articles) {
    const bodyText = stripHtml(article.body_html ?? "");
    await Article.updateOne({ _id: article._id }, { $set: { body_text: bodyText } });
    updated += 1;
  }

  console.log(`Backfilled body_text for ${updated} article(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("BACKFILL_FAILED", err);
  process.exit(1);
});
