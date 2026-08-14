import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const MONGODB_URI = "mongodb://127.0.0.1:27117/naprocs-newsletter";

const AdminSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password_hash: { type: String, required: true },
  totp_secret: { type: String },
  created_at: { type: Date, default: Date.now },
  last_login_at: { type: Date },
});
const Admin = mongoose.model("Admin", AdminSchema);

await mongoose.connect(MONGODB_URI);

const email = "admin@example.com";
const password = "preview1234";
const password_hash = await bcrypt.hash(password, 12);

const existing = await Admin.findOne({ email });
if (existing) {
  console.log(`Admin already exists: ${existing.email}`);
} else {
  const admin = await Admin.create({ name: "Preview Admin", email, password_hash });
  console.log(`Created admin "${admin.name}" <${admin.email}>`);
}

await mongoose.disconnect();
process.exit(0);
