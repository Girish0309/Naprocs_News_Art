import { v2 as cloudinary } from "cloudinary";

// Test-only in-memory double, activated ONLY when CLOUDINARY_MOCK=true — set solely by
// playwright.config.ts's webServer env for the E2E admin-flow spec (never in real dev/
// production; .env.local.example never sets it). This repo has no real Cloudinary
// account (see DEVIATIONS.md, Module 4) and Cloudinary has no sandbox/test mode that
// doesn't require one either, so the E2E cover-image-upload step — which needs to
// exercise the REAL upload UI, the real magic-byte check, and the real publish-
// validation gate against a REAL running server (not something `vi.mock` can reach) —
// has no working alternative except faking the one genuinely-external network call.
// Fakes exactly the two calls app/api/admin/upload-image/route.ts makes, returning
// dimensions safely above the app's own minimum (1440x900) so a normal upload passes.
const mockCloudinary = {
  uploader: {
    async upload(_dataUri: string, options?: { public_id?: string }) {
      const id = options?.public_id ?? `mock-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      return {
        secure_url: `https://res.cloudinary.com/mock/image/upload/${id}.jpg`,
        public_id: `naprocs-newsletter/covers/${id}`,
        width: 1600,
        height: 1000,
      };
    },
    async destroy() {
      return { result: "ok" };
    },
  },
};

if (process.env.CLOUDINARY_MOCK !== "true") {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export default (process.env.CLOUDINARY_MOCK === "true" ? mockCloudinary : cloudinary) as typeof cloudinary;
