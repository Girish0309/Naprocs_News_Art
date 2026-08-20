import type { Config } from "tailwindcss";

// Design tokens extracted from /design-reference (Stitch-exported mockups).
// Admin ("The Editorial") and user-site ("The Convergence") are intentionally distinct
// skins — same key names (primary, on-surface, etc.) resolve to different values,
// so they're namespaced under `admin-*` / `journal-*` rather than merged. Spacing and
// fontFamily don't have colliding values between the two, so those stay flat/shared.

const adminColors = {
  "on-primary-fixed": "#1c1b1c",
  "on-tertiary-container": "#a27e3b",
  "on-tertiary-fixed-variant": "#5e4100",
  "surface-bright": "#faf9f6",
  primary: "#000000",
  "surface-tint": "#5f5e5f",
  "primary-fixed": "#e5e2e3",
  "primary-container": "#1c1b1c",
  secondary: "#5d5f5e",
  "on-secondary-container": "#616362",
  "on-secondary": "#ffffff",
  outline: "#77777b",
  "on-primary-container": "#858384",
  "surface-container-high": "#e9e8e5",
  surface: "#faf9f6",
  "on-surface-variant": "#46464a",
  tertiary: "#000000",
  "secondary-fixed-dim": "#c6c7c6",
  background: "#faf9f6",
  "tertiary-fixed": "#ffdea9",
  "surface-dim": "#dbdad7",
  "surface-container": "#efeeeb",
  "surface-variant": "#e3e2df",
  "primary-fixed-dim": "#c8c6c7",
  "surface-container-low": "#f5f3f0",
  "on-error-container": "#93000a",
  "on-background": "#1b1c1a",
  "surface-container-highest": "#e3e2df",
  "inverse-on-surface": "#f2f1ed",
  "on-tertiary": "#ffffff",
  "secondary-fixed": "#e2e2e2",
  "surface-container-lowest": "#ffffff",
  "tertiary-container": "#271900",
  "on-secondary-fixed": "#1a1c1c",
  "tertiary-fixed-dim": "#ebc076",
  "on-error": "#ffffff",
  "inverse-primary": "#c8c6c7",
  "on-secondary-fixed-variant": "#454747",
  "on-primary-fixed-variant": "#474647",
  "inverse-surface": "#30312f",
  error: "#ba1a1a",
  "on-surface": "#1b1c1a",
  "on-tertiary-fixed": "#271900",
  "outline-variant": "#c7c6ca",
  // Formalizes a real, pervasively-used value that was only ever hardcoded as a raw
  // hex in admin.css (ported straight from the mockup's own <style> block) —
  // deliberately distinct from (lighter than) outline-variant, not a duplicate of it.
  hairline: "#e5e4e1",
  "secondary-container": "#dfe0df",
  "on-primary": "#ffffff",
  "error-container": "#ffdad6",
  // Backing color for translucent overlays (drawer backdrop, image-action buttons that
  // must stay legible over arbitrary photo content) — always used with an opacity
  // modifier (e.g. `bg-admin-scrim/50`), never on its own.
  scrim: "#000000",
};

const journalColors = {
  "surface-container-low": "#f4f4f0",
  "surface-container-highest": "#e3e3df",
  "on-secondary-fixed-variant": "#474744",
  "surface-dim": "#dadad7",
  "inverse-primary": "#accfb6",
  "on-tertiary-fixed": "#301215",
  "on-secondary": "#ffffff",
  "on-primary-fixed-variant": "#2f4d3a",
  "secondary-fixed": "#e5e2de",
  "on-primary-fixed": "#022111",
  "tertiary-fixed-dim": "#efb9bc",
  "inverse-on-surface": "#f1f1ed",
  "surface-bright": "#faf9f6",
  "surface-container": "#eeeeeb",
  "tertiary-container": "#512d30",
  outline: "#727972",
  "surface-container-lowest": "#ffffff",
  primary: "#082717",
  "secondary-fixed-dim": "#c9c6c3",
  "on-secondary-fixed": "#1c1c1a",
  "on-error-container": "#93000a",
  "on-surface-variant": "#424843",
  "primary-container": "#1f3d2b",
  background: "#faf9f6",
  "surface-container-high": "#e8e8e5",
  tertiary: "#38181b",
  error: "#ba1a1a",
  "on-surface": "#1a1c1a",
  "primary-fixed-dim": "#accfb6",
  "secondary-container": "#e5e2de",
  "on-tertiary-fixed-variant": "#633c3f",
  "tertiary-fixed": "#ffdadb",
  secondary: "#5f5e5c",
  "on-primary": "#ffffff",
  "on-secondary-container": "#656461",
  "on-background": "#1a1c1a",
  "on-tertiary": "#ffffff",
  "on-error": "#ffffff",
  "on-primary-container": "#87a890",
  "on-tertiary-container": "#c69497",
  surface: "#faf9f6",
  "primary-fixed": "#c8ebd1",
  "surface-variant": "#e3e3df",
  "outline-variant": "#c2c8c1",
  "inverse-surface": "#2f312f",
  "error-container": "#ffdad6",
  "surface-tint": "#466551",
  // See adminColors.scrim — added for parity even though no journal-side overlay
  // exists yet; always used with an opacity modifier (e.g. `bg-journal-scrim/50`).
  scrim: "#000000",
};

// fontFamily values are identical for every key shared between the two mockups
// (both use Source Serif 4 for headlines/body, Inter for UI labels), so this stays flat.
const sharedFontFamily = {
  "meta-caps": ["var(--font-inter)", "Inter", "sans-serif"],
  "ui-meta": ["var(--font-inter)", "Inter", "sans-serif"],
  "ui-label-lg": ["var(--font-inter)", "Inter", "sans-serif"],
  "ui-label-md": ["var(--font-inter)", "Inter", "sans-serif"],
  "ui-label-sm": ["var(--font-inter)", "Inter", "sans-serif"],
  "headline-md": ["var(--font-source-serif-4)", '"Source Serif 4"', "serif"],
  "headline-lg": ["var(--font-source-serif-4)", '"Source Serif 4"', "serif"],
  "display-lg": ["var(--font-source-serif-4)", '"Source Serif 4"', "serif"],
  "article-body": ["var(--font-source-serif-4)", '"Source Serif 4"', "serif"],
};

type FontSizeConfig = Partial<{ lineHeight: string; letterSpacing: string; fontWeight: string | number }>;
type FontSizeValue = string | [string, string] | [string, FontSizeConfig];

// fontSize *values* genuinely differ between admin and journal (different scale,
// rem vs px, fluid clamp() on the journal side) — these are namespaced.
const adminFontSize: Record<string, FontSizeValue> = {
  "meta-caps": ["11px", { lineHeight: "16px", letterSpacing: "0.05em", fontWeight: "700" }],
  "headline-md": ["24px", { lineHeight: "32px", fontWeight: "600" }],
  "headline-lg": ["32px", { lineHeight: "40px", letterSpacing: "-0.01em", fontWeight: "600" }],
  "ui-label-lg": ["16px", { lineHeight: "24px", fontWeight: "600" }],
  "article-body": ["18px", { lineHeight: "30px", fontWeight: "400" }],
  "ui-label-md": ["14px", { lineHeight: "20px", fontWeight: "500" }],
  "ui-label-sm": ["12px", { lineHeight: "16px", letterSpacing: "0.02em", fontWeight: "500" }],
  "display-lg": ["48px", { lineHeight: "56px", letterSpacing: "-0.02em", fontWeight: "700" }],
};

const journalFontSize: Record<string, FontSizeValue> = {
  "ui-label-lg": ["0.875rem", { lineHeight: "1.2", letterSpacing: "0.05em", fontWeight: "600" }],
  "headline-md": ["1.5rem", { lineHeight: "1.3", fontWeight: "600" }],
  "display-lg": ["clamp(2.5rem, 8vw, 4rem)", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "700" }],
  // Distinct from display-lg on purpose: the header wordmark shares its row with the
  // menu button and search control (page h1s like "Perspectives" don't), so it needs
  // its own smaller floor. Confirmed live, not assumed: display-lg's 2.5rem/40px
  // minimum still overflows the header at 320px even text-only, no icon involved —
  // "The Convergence" alone is long enough to need a smaller floor than "The Journal"
  // ever did.
  "brand-mark": ["clamp(1.375rem, 4.5vw, 1.875rem)", { lineHeight: "1.1", letterSpacing: "-0.01em", fontWeight: "700" }],
  "ui-meta": ["0.75rem", { lineHeight: "1.4", fontWeight: "400" }],
  "headline-lg": ["clamp(1.75rem, 5vw, 2.5rem)", { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "600" }],
  "ui-label-md": ["0.8125rem", { lineHeight: "1.4", fontWeight: "400" }],
  "article-body": ["1.125rem", { lineHeight: "1.65", fontWeight: "400" }],
};

// Tailwind's fontSize config (unlike colors) doesn't support nested namespace objects —
// each top-level key must resolve directly to a size tuple. So `admin`/`journal` are
// flattened into prefixed keys here (`admin-headline-md`) rather than nested.
function prefixFontSizeKeys(prefix: string, sizes: Record<string, FontSizeValue>): Record<string, FontSizeValue> {
  return Object.fromEntries(Object.entries(sizes).map(([key, value]) => [`${prefix}-${key}`, value]));
}

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Legacy placeholder palette — still used by the not-yet-restyled public
        // site pages and the root error/not-found pages.
        "near-black": "#0B0B0C",
        "off-white": "#FAFAF9",
        cream: "#FAF7F2",
        admin: adminColors,
        journal: journalColors,
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        full: "9999px",
      },
      spacing: {
        // Admin ("The Editorial")
        md: "24px",
        lg: "48px",
        xl: "80px",
        base: "8px",
        xs: "4px",
        "container-max": "1280px",
        "article-max": "680px",
        sm: "12px",
        // Journal ("The Convergence") — no key overlap with the above
        "max-reading-width": "680px",
        "section-gap": "5rem",
        "margin-safe": "2rem",
        gutter: "1.5rem",
        "element-gap": "1.5rem",
      },
      fontFamily: {
        serif: ["var(--font-source-serif-4)", "Source Serif 4", "serif"],
        sans: ["var(--font-inter)", "Inter", "sans-serif"],
        ...sharedFontFamily,
      },
      fontSize: {
        ...prefixFontSizeKeys("admin", adminFontSize),
        ...prefixFontSizeKeys("journal", journalFontSize),
      },
    },
  },
  plugins: [],
};

export default config;
