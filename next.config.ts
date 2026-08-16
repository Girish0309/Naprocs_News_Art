import type { NextConfig } from "next";

// Module 11 security pass. No per-request nonce: Next.js's own guide
// (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md) is
// explicit that nonce-based CSP requires every page to render dynamically, which
// would disable the SSG+ISR this app's public pages depend on (Modules 5/6/9/10).
// This is the same doc's own documented "Without Nonces" baseline instead — a static
// header via next.config.ts, not middleware, since nothing here needs to vary
// per-request.
const cspDirectives = [
  "default-src 'self'",
  // 'unsafe-inline' is required here, not optional: Next.js streams RSC/hydration
  // payloads via inline <script> tags with no nonce in this (non-nonce) setup — this
  // is Next's own documented baseline for apps that don't use per-request nonces, not
  // a loosening specific to this app's own code. No custom code in this app writes a
  // raw inline <script> itself (grepped for it) — the one script tag in custom code
  // is the JSON-LD block on the article page (Module 10), which uses
  // type="application/ld+json", a non-executable type CSP's script-src doesn't govern
  // at all, so it needed no allowance here either way.
  "script-src 'self' 'unsafe-inline'",
  // 'unsafe-inline' here is real and unavoidable without nonces: next/image's `fill`
  // mode (used for every cover/hero image on the public site) renders a real inline
  // `style="position:absolute;..."` attribute, and CoverImageUploader's upload
  // progress bar sets `style={{ width: ... }}` — both are inline style ATTRIBUTES,
  // which style-src governs the same way it governs <style> tags. Verified Tailwind
  // itself needs none of this — it's fully compiled to a static stylesheet at build
  // time — so this allowance is solely for the two cases above, not Tailwind.
  "style-src 'self' 'unsafe-inline'",
  // blob: for CoverImageUploader's local upload preview (URL.createObjectURL).
  // data: is for admin.css's .paper-grain background-image (a data:image/svg+xml
  // texture used behind the login page) — CSP's img-src governs CSS
  // background-image the same way it governs <img src>. (This directive previously
  // also carried the 2FA setup QR code's data:image/png URI; that feature was
  // removed post-launch, but paper-grain's own need for data: predates and is
  // independent of it.)
  "img-src 'self' https://res.cloudinary.com blob: data:",
  // Module 3 switched to next/font/google self-hosting — verified no remaining
  // fonts.googleapis.com/fonts.gstatic.com references anywhere in actual app code
  // (design-reference/*.html mockups still have them, but those are never served).
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: process.env.CLOUDINARY_CLOUD_NAME
          ? `/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/**`
          : "/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: cspDirectives.join("; ") },
          // Legacy pre-CSP fallback for the same "don't let this be iframed"
          // intent as frame-ancestors 'none' above — redundant in modern browsers,
          // harmless and free in older ones.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
