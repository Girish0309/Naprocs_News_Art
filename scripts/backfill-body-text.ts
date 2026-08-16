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

  // Deliberately dynamic, not a static top-level import — see create-admin.ts's
  // identical comment. lib/db.ts reads process.env.MONGODB_URI into a module-level
  // constant at import time, which a static import would evaluate before
  // loadEnvFile() above ever runs, silently capturing `undefined`.
  const dbConnect = (await import("../lib/db")).default;
  const Article = (await import("../models/Article")).default;
  const { stripHtml } = await import("../lib/article-text");

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
