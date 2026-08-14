import { Schema, model, models, type Document, type Model, type Types } from "mongoose";

export type ReactionType = "like" | "dislike";

export interface ReactionDocument extends Document {
  article_id: Types.ObjectId;
  fingerprint_hash: string;
  type: ReactionType;
  created_at: Date;
}

const ReactionSchema = new Schema<ReactionDocument>({
  article_id: { type: Schema.Types.ObjectId, ref: "Article", required: true },
  fingerprint_hash: { type: String, required: true },
  type: { type: String, enum: ["like", "dislike"], required: true },
  created_at: { type: Date, default: Date.now },
});

ReactionSchema.index({ article_id: 1, fingerprint_hash: 1 }, { unique: true });

export const Reaction: Model<ReactionDocument> =
  (models.Reaction as Model<ReactionDocument>) ?? model<ReactionDocument>("Reaction", ReactionSchema);

export default Reaction;
