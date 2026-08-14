import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import { getClientIp } from "@/lib/get-client-ip";

/**
 * Hashes IP + User-Agent together for anonymous rate-limiting and spam-pattern
 * detection (comments, reactions). This is NOT an identity mechanism — it's
 * purely a coarse per-device key. Never expose it to the client or other users.
 */
export function computeFingerprint(ip: string, userAgent: string): string {
  return createHash("sha256").update(`${ip}:${userAgent}`).digest("hex");
}

export function fingerprintFromRequest(request: NextRequest): string {
  const ip = getClientIp(request.headers);
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  return computeFingerprint(ip, userAgent);
}
