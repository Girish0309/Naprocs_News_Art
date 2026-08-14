# Design Reference — The Editorial / The Journal

Stitch-exported static HTML/CSS mockups. These are **reference only** — not live app code.
Do not import these directly into `/app`; extract the markup/classes/design tokens into real
Next.js components (see Module 3 build prompt).

## Admin console — "The Editorial"
- `admin/login.html` — sign-in screen (email/password + optional TOTP step)
- `admin/dashboard.html` — article list with status filters + search
- `admin/editor.html` — new/edit article screen (title, rich text, sticky sidebar with
  cover image, author, tags, publish/save actions)
- `admin/image-upload.html` — cover image upload states: dropzone → progress → security
  verification → verified
- `admin/comments.html` — comment moderation queue

## Public reading site — "The Journal"
- `user/homepage.html` — article listing / homepage with expanding search bar
- `user/article.html` — single article page with like button, comments section,
  "more like this"

## Design tokens (already encoded in each file's `tailwind.config`)

**Admin ("The Editorial")** — near-black primary (#000000), off-white surface (#faf9f6),
Source Serif 4 for headlines/article text, Inter for UI labels.

**User ("The Journal")** — deep forest green primary (#082717), cream surface (#faf9f6),
same serif/sans pairing. Note: the user-side primary color is a different value than the
admin's pure black — intentional, since these are two distinct-but-related brand skins.
Carry this into `tailwind.config.ts` as two token sets (or a shared base + per-surface
override) rather than merging them into one palette.
