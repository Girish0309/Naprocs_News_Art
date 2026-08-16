import { NextRequest, NextResponse } from "next/server";
import { fileTypeFromBuffer } from "file-type";
import { getServerAuthSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import cloudinary from "@/lib/cloudinary";

export interface UploadImageResponse {
  url: string;
  cdn_public_id: string;
  width: number;
  height: number;
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MIN_WIDTH = 1440;
const MIN_HEIGHT = 900;

// Allow-list of real magic-byte-verified MIME types. Never trust the client's
// `file.type` or filename extension for this decision.
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Layered defense for cover image uploads:
 *  0. Auth (session) + per-admin rate limit.
 *  a. Reject oversized bodies via Content-Length before reading anything.
 *  b. Re-check actual parsed size (Content-Length can't be trusted either).
 *  c. Sniff real magic bytes with `file-type` — ignore client MIME/extension.
 *  d. Re-encode + strip metadata via a Cloudinary incoming transformation, so
 *     the stored asset is never a passthrough of the uploaded bytes.
 *  e. Enforce minimum dimensions from Cloudinary's own response; delete the
 *     asset if it fails.
 */
export async function POST(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { success, reset } = await rateLimit(`upload-image:${session.user.id}`, 10, "1h");
  if (!success) {
    const retryAfterSeconds = Math.max(0, Math.ceil((reset - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Too many uploads. Please try again in a bit." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  // (a) Reject on declared size before touching the body at all. A client can lie
  // about or omit this header — see (b) for the check that can't be lied around —
  // but for the common case this avoids ever buffering an oversized upload.
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "File is too large. Max size is 10MB." }, { status: 413 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  // (b) The authoritative size check, against bytes we actually received —
  // catches a lying/absent Content-Length now that the body is parsed.
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "File is too large. Max size is 10MB." }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // (c) Magic-byte verification. A renamed .txt or a polyglot file with a spoofed
  // extension/MIME type fails here — file.type and the filename are never consulted.
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
    return NextResponse.json(
      { error: "That doesn't look like a valid JPG, PNG, or WEBP file." },
      { status: 400 }
    );
  }

  // (d) Upload with an incoming transformation: quality re-encode forces a genuine
  // decode→recompress (not a metadata-only edit), `force_strip` drops EXIF/IPTC/XMP,
  // and normalizing to jpg means the stored asset is never the original byte stream.
  let uploadResult;
  try {
    const dataUri = `data:${detected.mime};base64,${buffer.toString("base64")}`;
    uploadResult = await cloudinary.uploader.upload(dataUri, {
      folder: "naprocs-newsletter/covers",
      resource_type: "image",
      format: "jpg",
      transformation: [{ quality: "auto:good", flags: "force_strip" }],
      // A per-call option, not global cloudinary.config() — the SDK's own upload
      // request path (node_modules/cloudinary/lib/uploader.js) reads `options.timeout`
      // directly with no fallback to a configured default, so it must be set here.
      // Longer than lib/rate-limit.ts's 2.5s: uploads are inherently slower than a
      // Redis round trip, but this still bounds what would otherwise be the SDK's own
      // 60s default — long enough for a real upload, short enough to fail before an
      // admin assumes the request is simply lost.
      timeout: 15_000,
    });
  } catch (error) {
    console.error("[upload-image] Cloudinary upload failed:", error);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 502 });
  }

  // (e) Minimum dimensions, checked against what Cloudinary actually stored.
  if (uploadResult.width < MIN_WIDTH || uploadResult.height < MIN_HEIGHT) {
    await cloudinary.uploader.destroy(uploadResult.public_id).catch((error) => {
      console.error("[upload-image] Failed to clean up undersized asset:", error);
    });
    return NextResponse.json(
      {
        error: `Image is too small. Minimum dimensions are ${MIN_WIDTH}x${MIN_HEIGHT}px (received ${uploadResult.width}x${uploadResult.height}px).`,
      },
      { status: 400 }
    );
  }

  const response: UploadImageResponse = {
    url: uploadResult.secure_url,
    cdn_public_id: uploadResult.public_id,
    width: uploadResult.width,
    height: uploadResult.height,
  };
  return NextResponse.json(response);
}
