import { Schema, model, models, type Document, type Model } from "mongoose";

export type ArticleStatus = "draft" | "published";

export interface ArticleCoverImage {
  url: string;
  cdn_public_id: string;
  width: number;
  height: number;
  alt_text?: string;
}

export interface ArticleSeo {
  meta_title?: string;
  meta_description?: string;
}

export interface ArticleDocument extends Document {
  slug: string;
  title: string;
  author_name: string;
  cover_image?: ArticleCoverImage;
  body_html: string;
  body_json: unknown;
  body_text: string;
  excerpt?: string;
  tags: string[];
  status: ArticleStatus;
  seo?: ArticleSeo;
  like_count: number;
  dislike_count: number;
  comment_count: number;
  created_at: Date;
  updated_at: Date;
  published_at?: Date;
}

const CoverImageSchema = new Schema<ArticleCoverImage>(
  {
    url: { type: String, required: true },
    cdn_public_id: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    alt_text: { type: String },
  },
  { _id: false }
);

const SeoSchema = new Schema<ArticleSeo>(
  {
    meta_title: { type: String },
    meta_description: { type: String },
  },
  { _id: false }
);

const ArticleSchema = new Schema<ArticleDocument>(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    title: { type: String, required: true, trim: true },
    author_name: { type: String, required: true, trim: true },
    cover_image: { type: CoverImageSchema },
    body_html: { type: String, default: "" },
    body_json: { type: Schema.Types.Mixed },
    // HTML-stripped plaintext of body_html, computed and saved alongside it on every
    // create/update (see app/api/admin/articles/route.ts and .../[id]/route.ts) —
    // never derived at query time. Exists purely to keep the text index below free of
    // markup noise; not rendered anywhere.
    body_text: { type: String, default: "" },
    excerpt: { type: String },
    tags: { type: [String], default: [] },
    status: { type: String, enum: ["draft", "published"], default: "draft", required: true },
    seo: { type: SeoSchema },
    like_count: { type: Number, default: 0 },
    dislike_count: { type: Number, default: 0 },
    comment_count: { type: Number, default: 0 },
    published_at: { type: Date },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

ArticleSchema.index({ status: 1, published_at: -1 });
ArticleSchema.index({ tags: 1 });

// Single compound text index (MongoDB allows only one per collection) covering every
// field search should match against. Weights bias relevance toward a title/author hit
// over a body hit, without excluding body matches — both still count.
ArticleSchema.index(
  { title: "text", author_name: "text", tags: "text", body_text: "text" },
  { name: "ArticleTextIndex", weights: { title: 10, author_name: 6, tags: 4, body_text: 1 } }
);

export const Article: Model<ArticleDocument> =
  (models.Article as Model<ArticleDocument>) ?? model<ArticleDocument>("Article", ArticleSchema);

export default Article;
