import mongoose from "mongoose";

const MONGODB_URI = "mongodb://127.0.0.1:27117/naprocs-newsletter";

const ArticleSchema = new mongoose.Schema(
  {
    slug: String,
    title: String,
    author_name: String,
    cover_image: Object,
    body_html: String,
    body_json: mongoose.Schema.Types.Mixed,
    excerpt: String,
    tags: [String],
    status: String,
    seo: Object,
    like_count: Number,
    dislike_count: Number,
    comment_count: Number,
    published_at: Date,
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);
const Article = mongoose.model("Article", ArticleSchema);

const CommentSchema = new mongoose.Schema({
  article_id: mongoose.Schema.Types.ObjectId,
  author_name: String,
  fingerprint_hash: String,
  body: String,
  status: String,
  flagged_reason: String,
  created_at: { type: Date, default: Date.now },
});
const Comment = mongoose.model("Comment", CommentSchema);

await mongoose.connect(MONGODB_URI);
await Article.deleteMany({});
await Comment.deleteMany({});

const articlesData = [
  {
    slug: "welcome-to-the-journal",
    title: "Welcome to The Journal",
    author_name: "Tejesh",
    body_html:
      "<p>This is the first post on <strong>The Journal</strong> — a preview of the newsletter platform we've been building. It has a public site, an admin dashboard, a rich text editor, comments with spam filtering, and on-demand revalidation when you publish.</p><p>Feel free to click around, leave a comment, or head into the admin dashboard to write a new post.</p>",
    excerpt: "A first look at the newsletter platform, its public site, and its admin dashboard.",
    tags: ["Announcement"],
    status: "published",
    like_count: 3,
    dislike_count: 0,
    comment_count: 1,
    published_at: new Date("2026-08-10T09:00:00Z"),
    created_at: new Date("2026-08-10T09:00:00Z"),
  },
  {
    slug: "how-the-editor-works",
    title: "How the Editor Works",
    author_name: "Tejesh",
    body_html:
      "<p>Articles are written with a rich text editor (Tiptap) that autosaves as you type. Drafts stay private until you explicitly publish, which requires a title, body content, and a cover image with alt text.</p><p>Once published, the public page updates almost instantly thanks to on-demand revalidation — no waiting for a rebuild.</p>",
    excerpt: "A behind-the-scenes look at the article editor and the publish flow.",
    tags: ["Product"],
    status: "published",
    like_count: 1,
    dislike_count: 0,
    comment_count: 0,
    published_at: new Date("2026-08-12T14:30:00Z"),
    created_at: new Date("2026-08-12T14:30:00Z"),
  },
  {
    slug: "a-draft-in-progress",
    title: "A Draft in Progress",
    author_name: "Tejesh",
    body_html: "<p>This one is still being written — it should only show up in the admin dashboard, not on the public site.</p>",
    excerpt: "",
    tags: [],
    status: "draft",
    like_count: 0,
    dislike_count: 0,
    comment_count: 0,
    created_at: new Date("2026-08-13T11:00:00Z"),
  },
];

const created = [];
for (const data of articlesData) {
  const existing = await Article.findOne({ slug: data.slug });
  if (existing) {
    created.push(existing);
    continue;
  }
  created.push(await Article.create(data));
}
console.log(`Articles ready: ${created.map((a) => `${a.slug} (${a.status})`).join(", ")}`);

const welcome = created[0];
const existingComment = await Comment.findOne({ article_id: welcome._id });
if (!existingComment) {
  await Comment.create({
    article_id: welcome._id,
    author_name: "Priya",
    fingerprint_hash: "demo-fingerprint",
    body: "Excited to see this live! Looking forward to more posts.",
    status: "visible",
    created_at: new Date("2026-08-10T10:15:00Z"),
  });
  console.log("Seeded 1 comment on 'welcome-to-the-journal'");
}

await mongoose.disconnect();
process.exit(0);
