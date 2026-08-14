import { Schema, model, models, type Document, type Model } from "mongoose";

export interface AdminDocument extends Document {
  name: string;
  email: string;
  password_hash: string;
  totp_secret?: string;
  created_at: Date;
  last_login_at?: Date;
}

const AdminSchema = new Schema<AdminDocument>({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password_hash: { type: String, required: true },
  totp_secret: { type: String },
  created_at: { type: Date, default: Date.now },
  last_login_at: { type: Date },
});

export const Admin: Model<AdminDocument> =
  (models.Admin as Model<AdminDocument>) ?? model<AdminDocument>("Admin", AdminSchema);

export default Admin;
