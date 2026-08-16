import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { z } from "zod";
import dbConnect from "../lib/db";
import Admin from "../models/Admin";
import { MIN_PASSWORD_LENGTH } from "../lib/auth-constants";

const inputSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`),
});

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No .env.local present — assume env vars are already set in the shell.
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const rawName = await rl.question("Admin name: ");
  const rawEmail = await rl.question("Admin email: ");
  const rawPassword = await rl.question(`Admin password (min ${MIN_PASSWORD_LENGTH} chars): `);
  rl.close();

  const parsed = inputSchema.safeParse({ name: rawName, email: rawEmail, password: rawPassword });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      console.error(issue.message);
    }
    process.exit(1);
  }

  const { name, email, password } = parsed.data;

  await dbConnect();

  const existing = await Admin.findOne({ email });
  if (existing) {
    console.error(`An admin with email "${email}" already exists.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const password_hash = await bcrypt.hash(password, 12);
  const admin = await Admin.create({ name, email, password_hash });

  console.log(`Created admin "${admin.name}" <${admin.email}>`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
