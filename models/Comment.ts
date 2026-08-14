import { Schema, model, models, type Document, type Model, type Types } from "mongoose";

export type CommentStatus = "visible" | "flagged" | "removed";

export interface CommentDocument extends Document {
  article_id: Types.ObjectId;
  author_name: string;
  fingerprint_hash: string;
  body: string;
  status: CommentStatus;
  flagged_reason?: string;
  created_at: Date;
}

const CommentSchema = new Schema<CommentDocument>({
  article_id: { type: Schema.Types.ObjectId, ref: "Article", required: true },
  author_name: { type: String, required: true, trim: true },
  fingerprint_hash: { type: String, required: true },
  body: { type: String, required: true },
  status: { type: String, enum: ["visible", "flagged", "removed"], default: "visible" },
  flagged_reason: { type: String },
  created_at: { type: Date, default: Date.now },
});

// Public comment list: article_id + status "visible", oldest first.
CommentSchema.index({ article_id: 1, status: 1, created_at: 1 });
// Admin moderation queue: filter by status, most recent first.
CommentSchema.index({ status: 1, created_at: -1 });

export const Comment: Model<CommentDocument> =
  (models.Comment as Model<CommentDocument>) ?? model<CommentDocument>("Comment", CommentSchema);

export default Comment;
