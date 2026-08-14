import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getServerAuthSession: vi.fn() };
});

const rateLimitState = vi.hoisted(() => ({ counts: new Map<string, number>() }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async (key: string, limit: number) => {
    const count = (rateLimitState.counts.get(key) ?? 0) + 1;
    rateLimitState.counts.set(key, count);
    return { success: count <= limit, limit, remaining: Math.max(0, limit - count), reset: Date.now() + 60_000 };
  }),
}));

const cloudinaryMock = vi.hoisted(() => ({
  uploadResult: { secure_url: "https://res.cloudinary.com/test/x.jpg", public_id: "test-id", width: 1600, height: 1000 },
  upload: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock("@/lib/cloudinary", () => ({
  default: {
    uploader: {
      upload: (...args: unknown[]) => cloudinaryMock.upload(...args),
      destroy: (...args: unknown[]) => cloudinaryMock.destroy(...args),
    },
  },
}));

import { getServerAuthSession } from "@/lib/auth";
import { POST } from "@/app/api/admin/upload-image/route";
import { connectTestDb, clearDatabase, createTestAdmin } from "../helpers/db";
import { fakeSession } from "../helpers/fixtures";

const mockSession = vi.mocked(getServerAuthSession);
const VALID_PNG_BYTES = readFileSync(path.join(__dirname, "..", "..", "e2e", "fixtures", "test-cover.png"));

function uploadRequest(file: File, headers: Record<string, string> = {}) {
  const formData = new FormData();
  formData.append("file", file);
  return new NextRequest("http://localhost:3000/api/admin/upload-image", {
    method: "POST",
    headers,
    body: formData,
  });
}

describe("POST /api/admin/upload-image", () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
    mockSession.mockReset();
    rateLimitState.counts.clear();
    cloudinaryMock.upload.mockReset();
    cloudinaryMock.destroy.mockReset();
    cloudinaryMock.upload.mockResolvedValue(cloudinaryMock.uploadResult);
    cloudinaryMock.destroy.mockResolvedValue({ result: "ok" });
  });

  // T-037
  it("requires a session", async () => {
    mockSession.mockResolvedValue(null);
    const response = await POST(uploadRequest(new File([VALID_PNG_BYTES], "cover.png", { type: "image/png" })));
    expect(response.status).toBe(401);
  });

  // T-038
  it("rejects an oversized upload via the declared Content-Length, before reading the body", async () => {
    const { admin } = await createTestAdmin();
    mockSession.mockResolvedValue(fakeSession(admin.id));

    const response = await POST(
      uploadRequest(new File([VALID_PNG_BYTES], "cover.png", { type: "image/png" }), {
        "content-length": String(11 * 1024 * 1024),
      })
    );
    expect(response.status).toBe(413);
    expect(cloudinaryMock.upload).not.toHaveBeenCalled();
  });

  // T-039
  it("rejects an oversized upload via actual parsed size when Content-Length lies/is absent", async () => {
    const { admin } = await createTestAdmin();
    mockSession.mockResolvedValue(fakeSession(admin.id));

    const oversized = Buffer.concat([VALID_PNG_BYTES, Buffer.alloc(11 * 1024 * 1024)]);
    const response = await POST(uploadRequest(new File([oversized], "cover.png", { type: "image/png" })));
    expect(response.status).toBe(413);
  });

  // T-040 (priority)
  it("rejects a .txt file renamed with an image extension/MIME — real magic bytes don't match", async () => {
    const { admin } = await createTestAdmin();
    mockSession.mockResolvedValue(fakeSession(admin.id));

    const fakeImage = new File([Buffer.from("just plain text pretending to be a jpg")], "fake.jpg", {
      type: "image/jpeg",
    });
    const response = await POST(uploadRequest(fakeImage));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/valid JPG, PNG, or WEBP/i);
    expect(cloudinaryMock.upload).not.toHaveBeenCalled();
  });

  // T-041 (priority)
  it("accepts a real, magic-byte-verified PNG (Cloudinary mocked)", async () => {
    const { admin } = await createTestAdmin();
    mockSession.mockResolvedValue(fakeSession(admin.id));

    const response = await POST(uploadRequest(new File([VALID_PNG_BYTES], "cover.png", { type: "image/png" })));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ width: 1600, height: 1000 });
    expect(cloudinaryMock.upload).toHaveBeenCalledTimes(1);
  });

  // T-042 (priority)
  it("rejects an under-minimum-dimension result and cleans up the orphaned asset", async () => {
    const { admin } = await createTestAdmin();
    mockSession.mockResolvedValue(fakeSession(admin.id));
    cloudinaryMock.upload.mockResolvedValue({
      secure_url: "https://res.cloudinary.com/test/small.jpg",
      public_id: "small-id",
      width: 400,
      height: 300,
    });

    const response = await POST(uploadRequest(new File([VALID_PNG_BYTES], "cover.png", { type: "image/png" })));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/too small/i);
    expect(cloudinaryMock.destroy).toHaveBeenCalledWith("small-id");
  });

  // T-043
  it("is rate-limited after 10 uploads within an hour for the same admin", async () => {
    const { admin } = await createTestAdmin();
    mockSession.mockResolvedValue(fakeSession(admin.id));

    let lastResponse;
    for (let i = 0; i < 11; i++) {
      lastResponse = await POST(uploadRequest(new File([VALID_PNG_BYTES], "cover.png", { type: "image/png" })));
    }
    expect(lastResponse!.status).toBe(429);
  });
});
