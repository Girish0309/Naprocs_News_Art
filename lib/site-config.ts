/**
 * Single source of truth for site identity — was previously three separate hardcoded
 * copies (app/(public)/layout.tsx, page.tsx, articles/[slug]/page.tsx), which had
 * already drifted: layout.tsx's description and page.tsx's didn't match (Module 12
 * consistency pass). Consolidated here rather than making these DB-editable via the
 * new /admin/settings page — see that page for the tradeoff this decision makes.
 */
export const SITE_NAME = "The Convergence";
export const SITE_TAGLINE = "Essays on Culture, Design & Modern Life";
export const SITE_TITLE = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const SITE_DESCRIPTION =
  "Exploring thought, culture, and the art of modern narrative. A curated selection of long-form essays from The Convergence.";
export const SITE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
