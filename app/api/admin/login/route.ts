import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { peekRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Admin login itself is handled by NextAuth's credentials provider at
// /api/auth/[...nextauth] (see lib/auth.ts's authorize(), which is what actually
// enforces the per-IP rate limit — it's the only path that can't be bypassed). This
// route is a pre-flight UX nicety the login form calls before invoking signIn(): a
// non-consuming peek at the same limit, so a real login attempt doesn't burn two
// attempts against the budget, but the form can still show a clean, immediate
// "too many attempts" message without round-tripping through NextAuth's redirect flow.
export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const ip = getClientIp(request.headers);
  const { success, reset } = await peekRateLimit(`login:${ip}`, 5, "15m");

  if (!success) {
    const retryAfterSeconds = Math.max(0, Math.ceil((reset - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  return NextResponse.json({ ok: true });
}
