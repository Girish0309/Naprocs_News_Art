import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import dbConnect from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import Admin from "@/models/Admin";
import { withDbErrorHandling } from "@/lib/with-db-error-handling";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-constants";

const changePasswordSchema = z.object({
  current_password: z.string().min(1, "Current password is required."),
  new_password: z.string().min(MIN_PASSWORD_LENGTH, `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`),
});

export const POST = withDbErrorHandling(async (request: NextRequest) => {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  // A light limit here, unlike most admin routes (Module 11 audit deliberately skips
  // rate-limiting admin CRUD — session-gated, tiny admin pool, and a valid session
  // already grants full access regardless of request pace). A credential-change
  // endpoint is different: it's exactly what a compromised-but-not-fully-verified
  // session would try to abuse (lock the real admin out by changing their password),
  // so it gets a limit the routine CRUD routes don't need.
  const { success, reset } = await rateLimit(`change-password:${session.user.id}`, 5, "1h");
  if (!success) {
    const retryAfterSeconds = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  await dbConnect();

  const admin = await Admin.findById(session.user.id);
  if (!admin) {
    return NextResponse.json({ error: "Admin not found." }, { status: 404 });
  }

  const isCurrentValid = await bcrypt.compare(parsed.data.current_password, admin.password_hash);
  if (!isCurrentValid) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  // Matches scripts/create-admin.ts's cost factor — was 10 here, a drift from that
  // file's 12, not a deliberate choice. Existing password_hash values created at cost
  // 10 keep verifying correctly regardless (bcrypt hashes are self-describing, the
  // cost factor is stored in the hash itself); only hashes created from this point
  // forward use 12.
  admin.password_hash = await bcrypt.hash(parsed.data.new_password, 12);
  await admin.save();

  return NextResponse.json({ ok: true });
});
