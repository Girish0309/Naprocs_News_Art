# Deviations Log

Running record of every place the implementation deviated from the literal build prompt —
either because of a real constraint (missing credentials, a breaking change in an installed
package version), a deliberate simplification, or a bug found and fixed along the way.
Organized by module, in the order they came up.

---

## Module 1 — Infrastructure

- **`proxy.ts` instead of `middleware.ts`.** Next.js 16 deprecated the `middleware.js`
  file convention in favor of `proxy.js` (confirmed via `node_modules/next/dist/docs`) —
  same behavior, renamed file/export. `middleware.ts` still loads with a deprecation
  warning, but the current convention is `proxy.ts`, so that's what protects `/admin/*`.
- **`otplib` is a complete v13 rewrite.** The old `authenticator` singleton API (from
  training-data-era otplib) doesn't exist anymore. Used the new functional API
  (`generateSecret`, `generateURI`) for the TOTP setup route.
- **Login rate-limit enforcement point.** The 5-attempts/15-min check lives in the
  `/api/admin/login` pre-flight route the login form calls before `signIn()`, not
  duplicated inside NextAuth's `authorize()`. A direct POST to
  `/api/auth/callback/credentials` would bypass it. Worth hardening later if that
  matters — enforcing it inside `authorize()` too would close the gap.
- **Rate limiting fails open** (allows all requests) with a one-time console warning
  until `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are set in `.env.local`.
- Noticed a `next dev` process already running on port 3000 (not started by me) and a
  `design-reference/` folder I didn't create — left both untouched.

## Module 3 — Article CRUD + Editor (restyle to design reference)

- **TOTP login step is visual-only.** Per "keep Module 2 auth logic untouched — visual
  pass only," step 1 of login always advances to step 2 (cosmetic); the real `signIn()`
  call fires on step 2, and the 6-digit code isn't sent anywhere since `authorize()`
  doesn't verify TOTP yet. Wiring real enforcement is still future work.
- **Icons: `lucide-react`, not self-hosted Material Symbols.** Avoids replicating the
  mockup's `font-variation-settings` FILL/weight ligature-font tricks; simpler and more
  robust for a real app.
- **Animations: CSS transitions, not Framer Motion** — both were offered as valid
  options in the brief; CSS was simpler given no other module needs orchestrated
  enter/exit animations.
- **Fixed a real typo in the mockup's own CSS**: `ease-[conic-bezier(...)]` isn't a real
  CSS timing function (only `conic-gradient` exists) — it silently no-opped in the
  static mockup. Used the actual cubic-bezier curve instead.
- **Dropped the comment "flag reason" badge** (Harassment/Spam/etc.) from the
  moderation queue — no flagging system exists yet, and fabricating data for a real
  DB-backed screen felt worse than omitting it.
- **Added a kebab-menu "Delete" action** on dashboard rows, beyond the literal mockup
  (which shows the icon but doesn't wire it) — the working DELETE API already existed
  and leaving the icon fully inert seemed like a worse gap.
- **Excerpt/SEO fields aren't exposed in the editor UI** — the mockup doesn't show them;
  dashboard falls back to "No excerpt yet." "Preview" button is present but inert.
- **Real bug found and fixed during testing**: after publishing a new article,
  `router.replace()` to the new edit URL remounted `ArticleForm`, resetting local state —
  the autosave indicator was hard-coded to show "Draft" on that fresh mount regardless of
  actual status. Fixed to derive the idle-state label from the real `status` field.

## Module 4 — Cover Image Upload Security Pipeline

- **No real Cloudinary account exists.** The brief assumed credentials were "already in
  `.env.local`" — that file doesn't exist in the project. Verified everything
  Cloudinary-independent live (auth, rate-limit wiring, Content-Length check,
  magic-byte check) with real HTTP requests; verified the re-encode-params /
  dimension-check / cleanup-on-failure logic by temporarily swapping in a mocked
  Cloudinary client (fully reverted afterward, confirmed via `git status`/diff). Still
  need a real end-to-end upload once real credentials are added.
- **All uploads normalize to `.jpg`** (via `format: "jpg"` on the Cloudinary transform),
  which drops alpha transparency for PNG inputs — deliberate simplification to
  guarantee a genuine re-encode; fine for photographic cover images.
- **Dropzone copy changed** from the mockup's "JPG, PNG, TIFF" to "JPG, PNG, WEBP" —
  TIFF isn't in the actual magic-byte allow-list, and claiming otherwise would be
  actively misleading.
- **`proxy.ts` still doesn't cover `/api/admin/*`** (only page routes) — intentional,
  so API clients get clean JSON 401s instead of HTML redirects. The actual gate is the
  explicit session check inside each route handler, consistent with every module.
- **alt_text-required-before-publish only gates the explicit publish action** (a request
  that sets `status: "published"`), not every autosave on an already-published article —
  otherwise an article missing alt text could get permanently stuck unable to save any
  further edits.
- **Content-Length pre-check is a fast-path defense, not an absolute guarantee** — a
  client can lie about or omit the header, or use chunked transfer encoding. The
  authoritative check is the post-`formData()`-parse `file.size` check, which is also
  implemented, so the size limit holds either way — just not always via the fast path.

## Module 5 — Publish Mechanism / On-Demand ISR

- **Next.js 16 has two entirely different caching models.** 16 introduced "Cache
  Components" (`cacheComponents: true` + the `use cache` directive, a full
  Partial-Prerendering rewrite) as an opt-in model. This project's `next.config.ts`
  does **not** enable it, so the classic model applies: `export const revalidate`,
  `generateStaticParams`, `dynamicParams`, `revalidatePath`/`revalidateTag` from
  `next/cache` — exactly as built. Worth knowing this exists before anyone reaches for
  `"use cache"` here expecting it to do anything; it's a no-op without the flag.
- **`next dev` cannot be used to test ISR at all.** Per Next's own docs: "In Development,
  Pages are always rendered on-demand and are never cached." Every previous module's
  live-verification used `next dev`; this one required `next build && next start`
  (production mode) instead, since the entire feature being tested (static caching +
  time-based/on-demand revalidation) is disabled outright in dev mode. Flagging this
  because it's a real procedural difference future work on this app should keep in mind.
- **`revalidatePath` from a Route Handler invalidates, but regeneration happens on the
  *next* request** — not synchronously in the background right then. This is documented
  behavior ("Route Handlers: Marks the path for revalidation... only happens when the
  path is next visited"), not a bug, but it means "near-instant" specifically means "the
  next visitor gets it fresh," not "the cache updates itself the moment publish returns."
  In practice this is still effectively instant since the admin (or anyone) visiting the
  article right after publishing *is* that next request — verified at 42-58ms.
- **`x-nextjs-cache` response header showed `MISS`, not `REVALIDATED`, after an on-demand
  `revalidatePath` call — even when invalidating a page that was definitely already
  cached (confirmed `HIT` on the request immediately prior).** The docs list
  `REVALIDATED` as the value for "regenerated via on-demand revalidation," but empirically,
  in this exact setup (Next 16.3.0, Route Handler, self-hosted `next start`), an
  on-demand `revalidatePath` call causes the next request to report the same header value
  as a cold cache purge. This does **not** mean revalidation failed — I proved the
  opposite directly: published an article, cached it (`HIT`), edited its body and
  republished, and the very next request served the edited content in 42ms while an
  unrelated control request (before the edit) had shown `HIT`. The content update is
  real and fast; only the diagnostic header's specific label differs from what the docs
  describe. Don't rely on this header to *detect* on-demand revalidation in this setup —
  check content freshness directly instead.
- **Publish validation got stricter than Module 4's rule.** Module 4 only required alt
  text *if* a cover image was present. Module 5's brief listed "cover_image with alt_text
  set" as one of the required fields for publishing, which I read as cover image itself
  now being mandatory to publish (not just alt-text-conditional-on-cover-image). An
  article can still be saved as a draft with no cover image; it just can't be published
  without one.
- **Added save-time HTML sanitization that didn't exist before.** The brief said "don't
  trust stored HTML blindly *even though we sanitized on save too*" — but the article
  create/update routes never actually sanitized `body_html` before this module. Added
  `lib/sanitize.ts` and applied it at both save time (POST/PATCH article routes) and
  render time (public article page), so the "defense in depth" framing is now actually
  true rather than aspirational.
- **Revalidation also fires on unpublish and delete**, not just publish — not explicitly
  asked for, but the natural extension: if an admin unpublishes or deletes a live
  article, the public page and homepage should stop showing it immediately too, not
  linger for up to 60s. Verified live (article 404s again within milliseconds of
  unpublishing).
- **Public homepage/article pages are intentionally unstyled** (plain Tailwind), per the
  brief — Module 6 applies the real design. `dangerouslySetInnerHTML` is used for the
  sanitized body on the article page; this is safe specifically because the content
  passed to it has gone through `sanitizeArticleHtml()` immediately beforehand, with an
  explicit tag/attribute allow-list.
- **No real Cloudinary account still.** Same constraint as Module 4 — cover images in
  test articles used hand-written `cover_image` objects (same shape Module 4's upload
  endpoint returns) rather than a real upload, since publish-flow testing didn't need to
  re-exercise the upload pipeline itself (already verified in Module 4).

## Module 6 — Public Site Restyle ("The Journal")

- **Real bug found and fixed: the mockup's own floating-label CSS hides the labels
  entirely.** `design-reference/user/article.html`'s comment form uses `-z-10` on the
  `<label>` sibling of a `bg-transparent` input. On a page where any ancestor between the
  label and the document root paints an opaque background (here, the site's own
  `bg-journal-surface` wrapper) without establishing its own stacking context, a
  negative-z-index descendant renders *behind* that ancestor's background and becomes
  invisible. I caught this by literally screenshotting the rendered form (labels were
  blank) rather than trusting the copied classes, per the brief's own instruction to
  verify rather than assume. Fixed by dropping `-z-10` (added `pointer-events-none`
  instead, so the label can never intercept clicks meant for the input) — the label was
  never actually at risk of being hidden behind the *input's* content anyway, since it
  transforms to the floated/shrunk position before any real typed text would overlap it.
  This means the mockup itself, if opened directly in a browser, likely has this same
  invisible-label bug — worth knowing if anyone reuses that reference file elsewhere.
- **Real bug found and fixed: the collapsed search bar intercepted clicks on the header
  above it.** My first pass toggled only the `-translate-y-full` transform (matching the
  mockup's CSS transition), but never removed the element from layout when closed —
  unlike the mockup's own vanilla JS, which also toggles a `hidden` (`display: none`)
  class with a timed delay so the collapsed bar exits layout entirely, not just visually.
  Skipping that meant the transformed-off-screen overlay still occupied space that
  overlapped the search button, silently swallowing clicks — caught by Playwright
  ("subtree intercepts pointer events"), not by inspection. Fixed by adding a second
  `mounted` state that conditionally renders the whole overlay, delayed by the
  transition duration on close, mirroring the mockup's actual two-stage behavior.
- **`next/image` uses `fill` + a fixed-aspect-ratio container, not literal `width`/
  `height` props.** The brief asked for "proper width/height from the stored cover_image
  dimensions." `fill` is the correct `next/image` pattern for a responsive, consistently
  cropped thumbnail/hero (matching the mockup's fixed `aspect-[3/2]` grid and
  height-capped hero exactly) — passing the original stored dimensions as literal
  `width`/`height` while displaying at a much smaller size would just make next/image
  generate an oversized, wasteful `srcset`. The stored `width`/`height` are still used:
  passed through to `alt`-adjacent UI and available for any future layout that wants a
  true aspect-ratio box instead of a fixed one.
- **No manually-written article excerpts exist anywhere in the app** — Module 3's editor
  never added an excerpt field. Rather than show blank preview text under every headline
  (a real, visible gap against the mockup's design), added `deriveExcerpt()` in
  `lib/article-text.ts`, which truncates the article's own real body text at a word
  boundary. Not fabricated copy — every excerpt shown is genuine text lifted from that
  same article, used only as a fallback when `article.excerpt` is empty.
- **"Category" is just `tags[0]`.** The schema has a `tags: string[]` array, not a
  distinct single-category field. Displays the first tag, falling back to "Essay" when
  an article has no tags at all (exercised live via a seeded article with `tags: []`).
- **Like button and comment form are genuinely inert (Module 8 / Module 7 stubs), by
  design.** The like button toggles local visual state only and never calls
  `POST /api/articles/[id]/react` (still 501 upstream); the comment form shows a static
  "Comments aren't open yet" message on submit and never calls
  `POST /api/articles/[id]/comments` (also still 501). Both are marked with inline
  `TODO(Module N)` comments naming exactly what still needs wiring. No comment *list* is
  shown either — real comments don't exist yet, so an empty "No comments yet." state is
  used instead of the mockup's fabricated demo comments.
- **Share and Bookmark buttons are decorative** (`cursor-not-allowed`, no handler) — the
  mockup doesn't wire these to anything real either, and no module has claimed them yet.
- **Added `generateMetadata` to the article page** (sets the browser tab title to the
  real article title) — not explicitly requested, but every article showing the generic
  root layout title in the tab would be an obvious, easily-avoidable gap for a real site.
- **Search bar submit navigates to the existing (still-stub) `/search` page** — the
  brief asked specifically for the expand/collapse *interaction* to be real, not for
  full-text search results; `/search`'s own results (and `/api/search`) remain
  unimplemented from the original scaffold, out of this module's explicit scope.

## Module 7 — Real Comments

- **`Comment` model's status enum was renamed, not left as-is.** A Module 3 stub had
  already created `models/Comment.ts` with `status: "pending" | "approved" | "rejected"`
  and no `flagged_reason` field. The Module 7 brief specifies `"visible" | "flagged" |
  "removed"` plus `flagged_reason`. Renamed the enum and added the field rather than
  translating between two naming schemes at the API boundary — cleaner, and there was no
  real data to migrate (nothing had ever been written through the old stub, since the
  create/list/patch routes were all 501s or mock data until now). Every place that
  referenced the old values (`/api/admin/comments`, `CommentsQueue.tsx`) was updated to
  match. The admin queue's default filter and button labels changed accordingly: "Approve"
  now PATCHes to `"visible"`, "Remove" to `"removed"`, and the queue's default `GET`
  filter is `"flagged"` (was `"pending"`) — this is what the brief explicitly asks for
  ("list comments with a status filter, default: flagged").
- **Comment bodies are sanitized by stripping ALL HTML, not by an allowlist.** Article
  `body_html` uses an allowlist (`sanitizeArticleHtml`) because it's real rich-text
  content. Comments render as plain text in the mockup (no bold/links/etc.), so the
  stronger, simpler defense — `sanitizePlainText()`, `allowedTags: []` — is used instead.
  `sanitize-html` fully discards `<script>`/`<style>` tags *and* their inner content, and
  strips everything else down to bare text. Combined with React's default JSX
  text-escaping at render time (comments are rendered as `{comment.body}`, never via
  `dangerouslySetInnerHTML`), that's two independent layers against stored XSS. One
  consequence worth flagging: if sanitizing collapses a comment down to nothing (e.g. a
  body that was 100% markup), the route re-checks for emptiness *after* sanitizing and
  400s — otherwise a comment could sanitize down to blank text and still get stored.
- **Comments are only accepted for `status: "published"` articles.** Not explicitly
  stated in the brief, but the public comment form only ever renders on a live article
  page, so a POST against a draft or nonexistent article id now 404s identically either
  way. Without this check, someone could hand-craft a request against a draft's id and
  accumulate comments/`comment_count` on content nobody can see yet.
- **Spam keyword list and rate-limit thresholds are hand-picked starting points, not
  tuned rules** (per the brief's own caveat). `lib/spam-filter.ts` flags a comment if it
  contains more than 1 link, or matches any of ~20 common spam phrases (viagra/casino/
  forex/"click here"/etc. — the usual low-effort spam vocabulary). 5 comments per 15
  minutes per fingerprint was used verbatim from the brief. Both are trivial to retune
  once real spam patterns show up in the moderation queue — nothing else depends on
  these specific numbers.
- **Rate-limiting fails open without Upstash configured** — this is pre-existing
  behavior from Module 1's `lib/rate-limit.ts`, unchanged here, and it's why one of the
  four "confirm and describe" scenarios below needed a temporary test double to verify
  for real (see that section).
- **Flagged comments get a distinct client-side message, not silence.** When a
  submitted comment comes back with `status: "flagged"`, the form shows "your comment
  has been submitted and is awaiting review" instead of just not appending it to the
  list. The brief only explicitly asked for a clear error on rate-limit/validation
  failures, but a flagged (non-error) submission going visually nowhere would look
  identical to a silent failure to a real commenter — this isn't an error state, so it
  gets its own neutral message rather than being lumped into the error path.
- **`flagged_reason` is surfaced in the moderation queue UI**, not just stored. The
  brief only required the field to exist on the model; showing *why* a comment was
  flagged (e.g. "Matched spam keyword: \"viagra\"") directly under the body in
  `CommentsQueue.tsx` costs nothing and is genuinely useful context for the person
  deciding Approve vs. Remove.
- **Name-prefill uses a ref + `useEffect` DOM mutation, not `useState` + `localStorage`
  in a lazy initializer.** A lazy `useState(() => localStorage.getItem(...))` would read
  `window` during server rendering (crash) or desync from the server-rendered empty
  markup (hydration mismatch). Reading `localStorage` in an effect and then writing
  straight to the input's DOM node via a ref — instead of through React state — sidesteps
  both problems and, as a side effect, avoids re-triggering the
  `react-hooks/set-state-in-effect` lint issue hit twice already in this project
  (Modules 3 and 5): there's no `setState` call in the effect at all, just a direct
  `.value` assignment, which the rule doesn't flag.
- **New-comment fade/slide-in uses a CSS `@keyframes` animation on mount, not a
  two-stage React timer state.** Module 6's search bar needed a `mounted`+`open`
  two-stage state machine because it had to animate a re-used, persistent DOM node
  in and out of view. A newly-submitted comment is different: it's a brand-new list
  item with a stable `key` that only ever mounts once, so a plain `.animate-comment-in`
  class (added only to the just-submitted comment's id) triggers the browser's own
  mount-time animation with no JS timers, effects, or state transitions needed.
- **Old `CommentForm.tsx` was replaced by `CommentSection.tsx`**, not edited in place —
  it now owns the comment list (fetched/rendered) in addition to the form, since
  submitting a comment needs to update the same list it reads from. The static
  "No comments yet." paragraph that lived in `page.tsx` since Module 6 moved inside this
  component, now a real conditional on the real fetched/appended list instead of always
  being shown.
- **Live verification needed a temporary test double for `lib/rate-limit.ts`.** No
  Upstash Redis credentials exist in this environment, and `rateLimit()` fails open
  without them — meaning the real sliding-window path (the thing that actually produces
  the "6th request in 15 minutes gets blocked" behavior) can't be exercised as shipped.
  Followed the same pattern used for Cloudinary in Module 4 and `next.config.ts` in
  Module 6: swapped `lib/rate-limit.ts`'s body for a small in-memory sliding-window
  implementation with the *same exported signature*, ran the real POST route through 6
  requests from one fingerprint over HTTP (confirmed requests 1–5 succeed, 6th returns
  `429` with a `Retry-After` header and a clear message), then reverted the file back to
  the exact original Upstash-backed implementation and confirmed the revert by re-running
  a normal comment through it (still works, still logs the same one-time "not configured"
  warning as before). The shipped code was never touched by this — only the local test
  run temporarily substituted its backing store.

## Module 8 — Reactions

- **Initial reaction state is fetched client-side, not embedded server-side, to avoid
  breaking ISR.** The brief describes checking "on page load whether their fingerprint
  has an existing reaction." Doing that inside the article page's own server component
  would require calling `headers()` (from `next/headers`) to read the visitor's IP/UA —
  and per Next.js's own docs (checked directly, not assumed, given this repo's
  training-data-mismatch warning), `headers()` is a request-time API that opts the
  entire route into fully dynamic rendering the moment it's called. The article page is
  SSG'd with a 60s ISR fallback (Module 5) specifically so it doesn't do that. Rather
  than silently regress Module 5/6's caching model, `LikeButton` fetches its own initial
  state from a new `GET /api/articles/[id]/react` on mount instead — the page itself
  stays static/cacheable, and only the genuinely-personalized piece (has *this* visitor
  reacted) becomes a small dynamic client request, the same way the click itself already
  was. The initial like count is still passed down from the server-rendered `article`
  document for immediate paint (avoiding a flash of "0"); the mount fetch then reconciles
  it with the authoritative live count and the visitor's actual reaction state.
- **Only "like" is wired to the UI; "dislike" exists in the model and API but has no
  button.** The mockup (`design-reference/user/article.html`) has exactly one reaction
  button ("Appreciate"), no dislike control anywhere. The brief's own POST body shape
  (`type: "like" | "dislike"`) and the Reaction model support both, so the API and count
  logic are fully general — there's just nothing in this design that ever sends
  `type: "dislike"` yet. Not a gap; matches what Module 6 already established for this
  page.
- **A count number was added next to "Appreciate," which the mockup doesn't have.** The
  mockup's like button shows only an icon + the word "Appreciate" — no number, and its
  own demo script only toggles fill/color on click, no pulse animation anywhere. The
  Module 8 brief explicitly asks for a count that pulses on change, so a small count
  span and a `count-pulse` keyframe (`app/globals.css`) were added — a genuine addition
  for this brief's requirement, not a reproduction of something already in the
  reference file.
- **The atomic reaction logic is a conditional-delete-then-upsert, not one single
  Mongo command** (MongoDB has no single operation that can either upsert-or-delete a
  document depending on its current state, so this is two independently-atomic steps,
  not one round trip): first `findOneAndDelete({article_id, fingerprint_hash, type})` —
  if that matches, it's a same-type re-click (un-react) and nothing else runs; only if
  nothing matched does `findOneAndUpdate(..., {upsert:true})` run, to either create the
  first reaction or switch an existing opposite-type one. Each step's own query filter
  decides whether it fires — this is the "not a find-then-create-or-update" atomicity
  the brief asks for, just expressed as two atomic steps instead of one, since the
  three-way create/switch/delete branching isn't expressible as a single Mongo write.
- **Duplicate-key retry-on-catch was written defensively but never actually observed to
  fire, even under a 25-way concurrent stress test from one fingerprint** (see the
  Module 8 report for the full methodology and numbers). Kept in the code as a
  documented safety net — the empirical finding was that MongoDB's `findOneAndUpdate`
  with `upsert: true` already handles the "someone else inserted between my query and my
  insert" race internally (it's a single atomic server-side command, not a client-side
  query-then-insert pair), so the unique index plus that built-in behavior was
  sufficient on its own in every test run. Flagging this rather than claiming the retry
  path was proven to work under test, since it wasn't — it just never needed to.

## Module 9 — Search

- **The homepage search bar no longer navigates to `/search?q=...`; it renders results
  inline in-place, replacing the listing.** Module 6 originally wired the search bar's
  submit to `router.push` to a separate `/search` page (a page that itself was never
  built beyond the API stub). The Module 9 brief explicitly asks for inline,
  as-you-type results on the homepage instead, so that navigation was removed — submit
  now just collapses the search overlay, since results already update live underneath
  it. `SiteHeader` (which owns the input) and `HomeArticleList` (which owns the listing)
  are siblings under `app/(public)/layout.tsx`, not parent/child, so a new
  `SearchQueryContext` was added to connect them — the smallest mechanism that lets the
  header's typed input reach the homepage's list without prop-drilling through the
  layout, and it's a no-op on any other public page that doesn't read from it (e.g. an
  article page), since nothing there subscribes to the context.
- **The "Latest Essays" heading above the listing doesn't change to reflect an active
  search.** It's server-rendered in `app/(public)/page.tsx` for immediate paint;
  making it reactive to the client-only search state would mean either moving it into a
  Client Component or duplicating it, for a cosmetic touch the brief didn't ask for.
  Only the list content below it swaps between the normal listing and search results —
  the "No results for..." message makes it clear a search is active either way.
- **No separate "searching..." spinner state for re-searches, only for the very first
  one.** This mirrors `DashboardContent.tsx`'s own admin search (Module 3) exactly: that
  component's `loading` flag is initialized to `true` and set `false` once, never
  flipped back to `true` for subsequent filter/search changes — old results just stay
  on screen until new ones arrive and replace them. Setting a loading flag back to
  `true` synchronously at the top of the search effect trips the same
  `react-hooks/set-state-in-effect` rule this project has hit in Modules 3, 5, and 7;
  rather than fight it with another workaround, this follows the pattern the codebase
  already settled on. Net effect: `searchResults === null` shows "Searching..." only
  before the first-ever result set for this session arrives; every later query briefly
  shows the previous query's results until the new fetch resolves, then swaps — a
  standard stale-while-revalidate tradeoff, not a bug.
- **MongoDB's own text-search query syntax is exposed as-is, not sanitized/escaped.**
  Unlike the admin route's old `$regex` search (which had to escape regex metacharacters
  to avoid a malformed pattern), `$text: { $search: query }` is parsed by MongoDB itself
  and supports its own syntax — `"exact phrase"` for phrase matching, `-word` to exclude
  a term. This is intentional, useful behavior, not a gap, but worth knowing: a user
  typing `-spam` is deliberately excluding "spam" from their own results, not hitting an
  edge case.
- **The migration script (`scripts/backfill-body-text.ts`) loops one `updateOne` per
  article rather than a single `bulkWrite`.** Simplicity over throughput for a one-time
  migration at this project's likely scale — verified live against 4 seeded articles
  (see the Module 9 report), reporting `Backfilled body_text for N article(s).` If this
  is ever run against a very large collection, switching to `bulkWrite` would be the
  first thing to change.

## Module 10 — Discoverability (Metadata & SEO)

- **No new `NEXT_PUBLIC_SITE_URL` env var was added.** The brief said to add one "if
  one doesn't already exist... don't duplicate if Module 5's sitemap work already added
  something equivalent." It did: `NEXTAUTH_URL` has been the site's public base URL
  since Module 5 (`sitemap.ts`, `robots.ts`, and the admin PATCH route's `public_url`
  construction all already read it for exactly this purpose). Reused it for the new
  canonical/OG URLs too rather than introducing a second env var that would need to be
  kept in sync with the first in every environment. `.env.local.example` now documents
  this dual purpose inline so it isn't a silent convention.
- **Alt-text publish gating (item 5) already existed — no code change was needed.**
  Checked `lib/article-publish-validation.ts` before touching anything: `else if
  (!article.cover_image.alt_text?.trim()) missing.push("alt text for the cover image")`
  was already there, wired into both the POST (create) and PATCH (update) article
  routes, *and* `ArticleForm.tsx`'s `handlePublish()` already pre-emptively shows "Add
  alt text for the cover image before publishing." client-side before the request even
  fires. This must have landed as part of Module 5's publish-validation work, not
  Module 4 as the brief assumed. Verified live rather than trusting the read: created a
  draft with a cover image and empty `alt_text`, attempted to publish it, got the exact
  `400` with that message; added `alt_text` and republished successfully. No changes
  were made to this path — reporting it as confirmed-working, not as newly built.
- **Title templating lives in `app/(public)/layout.tsx`, not repeated per page.** A
  `title: { template: "%s | The Journal", default: "..." }` there means the article
  page's `generateMetadata` only needs to return the bare `article.title` — Next
  appends the site suffix automatically. The admin section has its own separate layout
  (`app/(admin)/layout.tsx`) and never inherits this template, so admin page titles are
  unaffected.
- **The homepage sets its own explicit `metadata` export** rather than relying on the
  layout's `default` title/description reaching it implicitly — the brief specifically
  asked for homepage-level metadata to live in `app/(public)/page.tsx`, so it's stated
  there directly (using `title: { absolute: ... }` to bypass the "%s | The Journal"
  template, since the homepage IS the site, not a page within it) even though the
  content is currently identical to what the layout default would have produced anyway.
- **JSON-LD's `publisher.logo.url` is a placeholder** (`${SITE_URL}/logo.png`) — no such
  file exists yet in `public/`. Explicitly allowed by the brief ("even a placeholder
  logo URL is fine for now"); flagging so it isn't mistaken for a real asset that was
  supposed to have been added.
- **JSON-LD output is escaped per Next's own documented guidance**
  (`.replace(/</g, "\\u003c")` on the `JSON.stringify` output) — `title`/`author_name`
  are plain admin-supplied strings with no HTML sanitization applied to them anywhere
  (only `body_html` gets sanitized), and this script tag uses `dangerouslySetInnerHTML`
  with no other escaping. Without this, a title containing `</script><script>...`
  would be a real stored-XSS vector through the JSON-LD block specifically — confirmed
  this by reading Next's own JSON-LD guide, which calls out exactly this risk.
- **Module 9's search has no bookmarkable `?q=` URL at all, contradicting an assumption
  in this module's brief.** Item 4 assumes "a shared search-result link should still
  resolve if someone bookmarks it" — implying a `?q=` URL exists. It doesn't: Module 9
  deliberately implemented the homepage search as pure client-side React context state
  (see `SearchQueryContext`), with no URL synchronization, so the address bar never
  changes while searching and there is nothing to bookmark today. `robots.ts`'s bare
  `allow: "/"` already wouldn't block a `/?q=...` URL if one existed — there was
  nothing to "unblock" — but the underlying feature the brief assumes isn't there.
  Retrofitting URL-synced search would be a real (if small) user-facing feature change
  to Module 9, which this module's own brief said was out of scope ("no new user-facing
  features"), so it wasn't added here. Flagging for a decision rather than silently
  picking one.
- **Live verification needed a full second Next.js instance, not just direct function
  calls** (unlike prior modules), since confirming real server-rendered `<head>` output
  and a JSON-LD `<script>` tag requires Next's actual metadata-resolution pipeline, not
  just checking `generateMetadata`'s return value. The user's own `next dev` was
  already running in this project directory, and Next enforces one dev-server
  instance per project directory regardless of port — so a second `next dev` here
  would either refuse to start or risk corrupting the shared `.next/` state. Instead:
  copied the project source (excluding `node_modules`/`.next`/`.git`) to an isolated
  scratch directory, physically copied `node_modules` there too (a directory
  junction/symlink was tried first but Turbopack refused to resolve it — "Symlink
  [project]/node_modules is invalid, it points out of the filesystem root" — so a real
  copy was used instead), and ran `next dev` from that separate directory against its
  own isolated in-memory MongoDB instance. This produced a genuinely independent server
  with no lock conflict and no risk to the user's session, which was verified
  unaffected (same PIDs, still running) before and after. Fully torn down afterward.

## Module 11 — Security Hardening

- **CSP is deliberately NOT nonce-based.** Next's own CSP guide (checked directly,
  `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`) documents
  a nonce-based approach as the stronger option, but nonces require every response to
  be dynamically rendered — they can't be baked into a statically-generated or
  ISR'd page, since the nonce has to be fresh per-request. That would force the public
  article page and homepage (SSG + 60s ISR since Module 5) into fully dynamic rendering,
  undoing that work for a security improvement this app's threat model doesn't need
  (no user-supplied `<script>` injection surface — `body_html` is sanitized on save and
  again on render). Used the docs' own "Without Nonces" static-header baseline instead,
  applied via `headers()` in `next.config.ts`.
- **CSRF protection is a same-origin header check, not a token.** `lib/csrf.ts` compares
  the request's `Origin` (falling back to `Referer`) against `SITE_URL`, rejecting
  cross-origin POSTs to the comments/reactions endpoints. A classic per-form CSRF token
  would also work but needs a place to mint/verify it for endpoints with no session
  (anonymous comment/reaction submissions) — same-origin checking is the simpler
  mechanism that fits an API with no CSRF-token-bearing session for anonymous visitors,
  and is what Next itself recommends for Route Handlers guarding state-changing
  anonymous POSTs.
- **Real gap found: the reactions endpoint (`/api/articles/[id]/react`) had no rate
  limit at all**, unlike comments (Module 7) which already had one. Anyone could hammer
  like/dislike with no throttling. Added the same `rateLimit()` call pattern used
  elsewhere, keyed by fingerprint.
- **Real gap found: four query-param-accepting routes parsed `req.nextUrl.searchParams`
  directly with no Zod validation** (page/limit/status on a couple of admin list routes
  and the public search route) — a non-numeric `page` would `NaN` its way into a Mongo
  query rather than 400ing cleanly. Added `lib/query-params.ts` (shared
  parse-and-clamp helpers) and applied it at all four call sites rather than duplicating
  ad hoc parsing logic per route.
- **`npm audit` was already clean (0 vulnerabilities) going in** — no dependency
  changes were needed for this module; confirmed rather than assumed.

## Module 12 — Consistency Review, Missing Screens, Accessibility & Responsive Pass

### Part A — Consistency review (findings, then fixes)

Found and fixed:
- **Real hardcoded-hex drift in `app/(admin)/admin.css`**: several rules referenced raw
  hex values instead of `theme("colors.admin.X")` tokens, and one was an actual bug, not
  just a style-consistency nit — `.floating-label-input:focus` used `#0b0b0c`, a legacy
  near-black value that predates the current `admin.primary` token (`#000000`), so a
  focused input's border/shadow was subtly the wrong shade of black from every other
  focus-state element on the same screen. Replaced every raw hex in that file with the
  matching token call. Added a `hairline` token to `tailwind.config.ts`'s `adminColors`
  (`#e5e4e1`) to formalize a border shade that was previously only ever hardcoded.
- **`components/admin/LoginForm.tsx` had a raw `bg-[#0B0B0C] text-[#FAFAF9]`** instead
  of `bg-admin-primary text-admin-on-primary` — same drift pattern, one screen missed
  when the token system was set up.
- **The sticky-publish-button claim didn't hold before this module's fix.** Checked the
  actual JSX: the aside's Preview/Publish header was just the first item inside the same
  `flex flex-col` scrolling container as everything else below it (cover image uploader,
  author, tags, alt text) — not `position: sticky` at all. With every field Modules 4/5/9
  added to that sidebar, the estimated content height is close to a typical viewport
  height, meaning the buttons genuinely could scroll out of view on a smaller screen —
  exactly the failure mode the Module 3 design intended to prevent. Fixed by splitting
  the aside into a `sticky top-0 z-10 shrink-0` header (Preview/Publish) and a separate
  scrollable content div below it.
- Nav active-state left-border accent and the spring-easing vs. simple-ease split were
  both already consistent across every admin screen — confirmed by grepping every nav
  `Link` and every `transition`/`ease-` usage, not just spot-checked.
- Journal vs. Editorial token cross-contamination: none found. Grepped both directions
  (`journal-` classes under `app/(admin)/`, `admin-` classes under `app/(public)/`) —
  zero matches either way.

### Part B — Missing screens

- **Site metadata: kept as code constants, not made DB-editable.** Module 10's homepage
  metadata was hardcoded (and had genuinely drifted — `layout.tsx`'s description didn't
  match `page.tsx`'s). Consolidated both into new `lib/site-config.ts` constants rather
  than adding a database-backed settings document. Tradeoff either way: a DB-backed
  version would let an admin change the site name/description without a redeploy, at the
  cost of a new model, a new API route, a new place these values could silently drift
  from what `sitemap.ts`/`robots.ts`/JSON-LD read, and a cache-invalidation question
  (these values are read at build/request time by statically-generated pages). Given
  this is a single-site, developer-operated newsletter (not a multi-tenant CMS), the
  code-constant approach was chosen — `SettingsContent.tsx`'s site-metadata card
  displays these values read-only with an explanatory note, rather than silently
  omitting the section or silently making it look editable when it isn't.
- **2FA UI surfaces setup only — no backup codes, no login-time enforcement.** Module
  2's `/api/admin/2fa/setup` endpoint regenerates/overwrites the TOTP secret on every
  call, so the UI never auto-fires it on mount (would silently invalidate an existing
  pairing on page load) — it's button-triggered, with an explicit on-screen warning that
  scanning a new code replaces any previous pairing. No backup-codes concept exists
  anywhere in the schema/API from Module 2, so none was fabricated for this UI — the
  card explicitly states codes aren't implemented rather than showing fake ones. Also
  explicitly notes 2FA isn't enforced at login yet (consistent with the Module 3 finding
  that TOTP login is still visual-only) — surfacing the setup flow doesn't imply it's
  wired into `authorize()`, and the UI says so rather than implying otherwise.
- **`app/(admin)/not-found.tsx` calls `requireAdminSession()` again, redundantly.**
  `proxy.ts` already gates every `/admin/*` request before it renders, so by the time
  this boundary can render at all, the visitor is already authenticated — the re-check
  is defensive, not a new auth gate, and lets the 404 page show the real admin's name in
  the shell instead of a generic one.
- **404/error split by route group, not one shared file.** Checked Next's own docs
  (`file-conventions/not-found.md`, `error.md`): both support per-segment nesting, and a
  root `app/not-found.tsx`/`app/error.tsx` specifically catches genuinely-unmatched URLs
  or errors *outside* any segment, regardless of route groups. Used a 3-tier split:
  a neutral root fallback (`app/not-found.tsx`, `app/error.tsx` — off-white/near-black,
  no site-specific chrome, for anything outside both route groups), a Journal-styled
  pair under `(public)`, and an Editorial-styled pair under `(admin)` (the admin one
  wrapped in the full `AdminShell`, so a bad article ID still looks like part of the
  same console instead of a generic page). Chose this over one shared neutral file
  because a bad article-editor URL and a bad public article URL are different audiences
  with different "what do I do next" answers ("Back to Dashboard" vs. "Back to The
  Journal") — a single file would have to either pick one context arbitrarily or add
  runtime path-sniffing logic to fake what route grouping already gives for free.
  `app/(admin)/error.tsx` is intentionally *not* wrapped in `AdminShell` — `error.tsx`
  must be a Client Component, and `AdminShell` needs the session object as a prop from a
  Server Component parent that isn't available at that boundary — so it's styled with
  the same admin color tokens standalone instead.
- **Loading skeletons added for homepage, article page, and admin dashboard**, adapted
  from Module 4's shimmer pattern to article-row and article-body shapes. In practice
  these are rarely seen for the homepage/article page specifically because they're
  SSG/ISR'd (Module 5) — the skeleton only shows on a genuinely uncached request. Added
  anyway since that path still exists (first request after a revalidation, or if caching
  is ever disabled), and the admin dashboard (always dynamic, session-gated) will show
  its skeleton on every load.
- **Empty states confirmed/enhanced, not left as bare text**: dashboard-zero-articles,
  comments-queue-zero-pending, homepage-zero-published, and search-no-results were all
  already functionally handled from earlier modules but varied in polish — added an icon
  (`FileText`/`SearchX`/`BookOpen`) and centered layout to the ones that were still just
  a plain sentence, matching the treatment the best of the existing ones already had.

### Part C — Accessibility

- Added `aria-label`s to every icon-only control that had none: search toggle/close
  (`SiteHeader`), like button (`LikeButton`), dashboard row actions — edit/more/delete/
  pagination (`DashboardContent`), toolbar buttons (`ArticleEditor`), cover-image remove
  (`CoverImageUploader`), comment moderation approve/remove (`CommentsQueue`) — most
  using a dynamic label (e.g. `Edit "{title}"`) rather than a generic one, so a screen
  reader user distinguishes rows in a list.
- Added real visible `:focus` rings (`focus:outline-none focus:ring-2 focus:ring-*`) to
  every interactive element found relying on hover-only or browser-default (often
  invisible against these color schemes) focus styling — nav links, buttons, the
  article title input (previously `focus:ring-0` with no visible replacement at all).
- Fixed floating-label-style inputs that weren't programmatically associated: Author/
  Tags fields in `ArticleForm` gained real `htmlFor`/`id` pairs; "Last Modified" changed
  from a `<label>` to a `<span>` since it's a static value, not a form control, and a
  `<label>` with nothing to associate with is itself an accessibility bug (announces as
  a label for the *next* focusable element, whatever that happens to be). Same fix
  applied to `CoverImageUploader`'s alt-text field and the Settings page's forms (using
  `useId()` for unique, collision-proof id generation there specifically since that
  page can in principle render multiple instances of similar fields).
- **Touch-device gap found and fixed**: `DashboardContent`'s row actions used
  `opacity-0 group-hover:opacity-100` — invisible and unreachable with no mouse. Changed
  to visible-by-default below `md`, hover-reveal preserved at `md`+.
- **Contrast spot-checked with the actual relative-luminance formula**, not assumed:
  computed for near-black-on-cream and forest-green-on-cream body-text pairs currently
  in use; all pass WCAG AA (4.5:1) for body text, several comfortably clear it.

### Part D — Responsive verification

Checked at 375px/768px/1440px; found and fixed two real breakpoint bugs, plus a hero
image sizing issue on the article page:
- **`ArticleForm`'s editor pane and sidebar both had unconditional `h-full`/
  `overflow-hidden`/`overflow-y-auto`.** Below `md` they stack (`flex-col` instead of
  `flex-row`), and two stacked children both fighting for 100% of a height that only
  makes sense in a side-by-side layout produced broken/clipped scrolling on mobile.
  Gated those classes behind `md:`, letting the whole `<main>` scroll normally below
  `md` and each pane regain independent scroll at `md`+.
- **The article page's cover-image hero was a fixed `h-[614px]`** — on a 375px-wide
  phone that's nearly 2x taller than wide. Scaled to `h-[320px] sm:h-[420px]
  md:h-[614px]`, full size preserved from `md` up where the original design intent
  (and the aspect ratio) actually holds.
- **Not fixed, flagged as a judgment call**: `SiteHeader`'s mobile viewport has no
  hamburger/overflow menu for the nav links that are hidden below `md` — those
  destinations (currently just to the homepage itself and inert Share/Bookmark-style
  stubs) aren't reachable on a phone except via the logo. Building a new mobile-nav
  pattern is a real feature addition beyond "verify and fix what's broken," which is
  what this module's brief scoped Part D to — left as a known gap rather than silently
  building a hamburger menu the brief didn't ask for.

### A verification-methodology finding, not a bug

Initially suspected `app/(admin)/not-found.tsx` wasn't rendering: hitting a bad article
ID with `curl` returned `<html id="__next_error__">` and a raw
`NEXT_HTTP_ERROR_FALLBACK;404` digest string, with none of `AdminShell`'s sidebar text
(`"The Editorial"`, `"Newsletter Console"`) visible anywhere in the response, and the
`<title>` still reading the root layout's default. Investigated by comparing against a
known-good, ordinary admin page (`/admin/dashboard`, HTTP 200) under the same
production (`next build && next start`) conditions using a hand-minted session JWT
(Upstash isn't configured in this test environment, and Module 1/11's fail-closed-in-
production rate limiter correctly blocks the login endpoint entirely without it — itself
a confirmation that fix is working as designed, not a bug). **The successful dashboard
page showed the exact same pattern**: an empty `<body>` shell (just a hidden marker div)
with all real content — including `"The Editorial"`/`"Newsletter Console"`/the admin's
name — serialized inside a `self.__next_f.push([...])` React Flight payload script tag,
not as literal DOM text. This is how this Next.js version streams *every* dynamic,
session-gated admin route (both success and error/not-found responses alike) — the
initial HTTP response is a minimal shell plus the data needed for client-side hydration,
not fully inlined HTML. `curl` (and a plain-text grep) can't distinguish a correctly-
working page from a broken one under this model, since neither renders visible DOM text
without executing the embedded JavaScript. Re-verified by grepping the same response's
*flight payload* instead of its rendered HTML: the not-found page's actual content
("Not found", "Back to Dashboard", the `FileQuestion` icon, wrapped in `AdminShell` with
the correct `adminName`) is present and correct. **Conclusion: no bug — the page works;
the earlier dev-mode test was a false alarm from checking for the wrong signal.** One
small, real, separate finding did come out of this: neither `(admin)/layout.tsx` nor
`(admin)/not-found.tsx` set their own `<title>`, so it falls back to the root layout's
"Naprocs Tech" default rather than anything admin-specific — minor, cosmetic, left as-is
since fixing every admin page's title metadata is a bigger, separate scope than this
module's brief.

### Testing infrastructure

Same temp-mongodb-memory-server pattern as every prior module needing a live DB
(installed with `--no-save`, never touched the lockfile) — seeded one admin and one
published article for this module's live checks, torn down afterward: production
server and test `mongod` processes killed, `scripts/_module12-seed.ts` deleted,
`mongodb-memory-server`/`-core` removed from `node_modules`, `npm install` re-run to
reconcile (0 vulnerabilities, matches Module 11's clean audit), `tsc --noEmit` and
`eslint .` both clean.

## Module 13 — Automated Test Suite

- **`mongodb-memory-server` is now a real, saved `devDependency`**, not the temporary
  `--no-save` install used for one-off live verification in every prior module. The
  test suite needs it every run, permanently, so it belongs in `package.json`/the
  lockfile like any other dependency this project actually relies on.
- **The whole Vitest run is pinned to a single worker** (`fileParallelism: false` in
  `vitest.config.ts` — Vitest 4 renamed/flattened the older `poolOptions.forks.
  singleFork` into this top-level flag, discovered via a deprecation warning on first
  run and fixed). Every integration test connects through the app's own real
  `lib/db.ts` connection singleton (not a second, parallel test-only client), which
  caches its connection on the Node `global` object — real parallel workers would each
  need their own in-memory Mongo instance or race on that shared cache. One shared
  instance (`tests/setup/global-setup.ts`), one worker, collections cleared between
  tests — simpler and fast enough at this project's scale (125 tests in ~5s of actual
  test time).
- **One framework-level mocking seam, used consistently everywhere it's needed**:
  session-gated routes mock only `getServerAuthSession()` from `lib/auth.ts` (via
  `vi.mock` with `importOriginal` preserving every other export). This isn't a
  shortcut around route logic — `next-auth`'s `getServerSession()` reads cookies via
  `next/headers`, which only resolves inside a real Next.js request scope (confirmed
  by reading `next-auth`'s own source), so it simply cannot run inside a plain Vitest
  process. Every other line of each route — Zod validation, Mongoose queries, business
  logic — runs unmodified against the real in-memory database. Full reasoning is in
  `testing/test-case-matrix.md`'s "Note on the auth mocking seam."
- **No real Upstash Redis credentials exist in this environment** (same as every
  prior module's finding — `.env.local` has them blank). `lib/rate-limit.ts`'s
  documented behavior is to fail OPEN outside production and fail CLOSED in
  production when unconfigured — neither is "the Nth request specifically fails,"
  which is what most of the matrix's rate-limit rows need to test. Rather than
  fight this per test, routes that need deterministic rate-limiting mock
  `@/lib/rate-limit` with a small, real, in-memory fixed-window counter (same
  call signature, same test-double pattern the Module 7 audit used for the same
  reason) — this is a controlled substitute for the one genuinely-external
  dependency, not a fake of the business logic being tested.
- **`lib/cloudinary.ts` gained a test-only double**, activated only by
  `CLOUDINARY_MOCK=true` (set solely in `playwright.config.ts`'s `webServer.env` —
  never in real dev/production, never in `.env.local.example`). Vitest integration
  tests mock `@/lib/cloudinary` directly per-file and never touch this; it exists
  specifically so the E2E admin-flow spec can drive the *real* upload UI (real
  magic-byte check, real rate limit, real publish-validation gate) against a real
  running server, with only the one actually-external network call (no Cloudinary
  account exists here) faked.
- **Real refactor: extracted the inline "more like this" query out of
  `app/(public)/articles/[slug]/page.tsx` into `lib/related-articles.ts`
  (`getRelatedArticles()`).** The logic was previously embedded directly in a Server
  Component, which isn't independently callable the way a route handler or a plain
  function is — testing it faithfully would have meant walking the returned JSX
  element tree looking for rendered links, which is both fragile and a poor proxy for
  the actual query logic. Extracting it into a plain, directly-testable function
  changes nothing about behavior (same query, same fallback), and the page component
  now just calls it. This is the one non-test-infrastructure code change this module
  made to the app itself.
- **A real bug in one of my own tests, not the app — found and fixed**: the sitemap
  `lastModified`-prefers-`updated_at` test initially failed because `models/Article.ts`'s
  `timestamps: true` schema option overwrites `updated_at` on every plain `.save()` —
  my test tried to set a past `updated_at` via `article.save()`, which Mongoose
  silently overwrote with the current time. Fixed the test (`Article.findByIdAndUpdate`
  with `{ timestamps: false }` to make the explicit value stick), not the app — the
  app's real automatic-timestamp behavior is correct as-is.
- **T-099 (login rate limiting via the real NextAuth HTTP endpoint) had its scope
  adjusted mid-build**, not silently narrowed: the original plan was to reproduce the
  audit's exact "hammer it 6 times, watch the 6th fail" method against the E2E
  server, but that server has no Upstash credentials either, so `rateLimit()` fails
  open there (correct, documented behavior outside production) — the 6th attempt
  would succeed exactly like the first, proving nothing about rate limiting. Running
  the E2E server in production mode instead would fail closed from the *first*
  attempt (breaking the login-dependent admin-flow test, and still not isolating "the
  6th specifically"). T-009 (a Vitest integration test, deterministic, mocked) is the
  real regression test for this; T-099 was rescoped to what the live endpoint
  *can* honestly prove without Upstash — that it enforces real credentials on its own,
  reachable independent of the pre-flight route. Full reasoning in
  `testing/test-case-matrix.md`'s note 3.
- **Two matrix rows are explicitly not automated, each re-examined rather than
  reflexively repeating the audit's old excuse**: the `ArticleForm` autosave
  dirty-flag race (still genuinely not reproducible without component-level testing
  infrastructure — jsdom/`@testing-library/react` — that's outside this module's
  Vitest-for-routes/Playwright-for-browser-flows scope) and the one-time
  `backfill-body-text.ts` migration script (no code path the running app ever calls
  again). See `testing/test-case-matrix.md`'s notes 1 and 2 for the full reasoning.
- **Coverage is scoped to `app/api/**` + `lib/**`** (excluding `site-config.ts`,
  `env.ts`, `cloudinary.ts` — constants/config, not logic), per this module's brief;
  84% statements / 79% branches overall. The gaps are all explainable, not silently
  accepted: `lib/rate-limit.ts` (41%) is mostly the real Upstash-backed code path,
  which this environment has no credentials to exercise (the "unconfigured" branches
  it CAN reach are fully covered); `lib/auth.ts` (59%, 20% functions) reflects that
  `getServerAuthSession`/`requireAdminSession` are mocked out in every route test
  (deliberately — see the mocking-seam note) and only `authorize()` gets real Vitest
  coverage, though `requireAdminSession`'s redirect-when-unauthenticated behavior IS
  exercised for real by the E2E suite, just invisible to a coverage tool that only
  instruments the Vitest process; `lib/auth-actions.ts`'s `logout()` and
  `app/api/auth/[...nextauth]/route.ts` are both 0% for the identical reason (both
  need a real Next.js request scope) and are both exercised for real in the E2E admin
  flow (login via real `signIn()`, logout via a real Server Action) — real coverage
  that exists, just not in this specific report. `app/api/articles/[id]/route.ts`
  (public GET-by-slug) is genuinely 0% because it's an unimplemented `501` stub
  (confirmed by reading it) that nothing in the app actually calls — the real public
  surface for "does a draft resolve by slug" is the page component itself, tested
  directly in `sitemap-and-discoverability.test.ts`.
- **Incidental finding, not fixed (out of this module's scope)**: `app/api/articles/
  [id]/react/route.ts` and `app/api/admin/comments/route.ts` both trigger a Mongoose
  deprecation warning (`the "new" option for findOneAndUpdate()... is deprecated. Use
  returnDocument instead`) on every test run. Pre-existing behavior from whichever
  earlier module wrote those queries, surfaced by actually running the code
  repeatedly for the first time — worth a follow-up cleanup pass, but renaming an
  option on working, correct queries is unrelated to building a test suite, so it
  wasn't changed here.
- **No GitHub remote is configured for this repository** (`git remote -v` is empty,
  and git history is still just the one "Initial commit from Create Next App" —
  confirmed directly rather than assumed). Added `.github/workflows/ci.yml` anyway,
  since the brief's "if this repo is on GitHub" is about where the workflow file
  would eventually run, not a precondition for adding it — it's inert until pushed to
  an actual GitHub repository, and won't have run there yet. The workflow needs no
  repository secrets: every env var the test suite requires is generated in-process
  (`tests/setup/global-setup.ts`, `playwright.config.ts`), so it should run
  identically on a GitHub-hosted runner as it does here, but that's unverified until
  this is actually pushed somewhere.
- **Fresh-clone verification used a working-tree copy, not `git clone`**, since this
  repository has never been committed beyond its initial scaffold (see above) — a
  real `git clone` would reproduce only that scaffold, not the app. Copied every
  tracked-or-untracked-but-not-gitignored file (`git ls-files --cached --others
  --exclude-standard`) to an isolated scratch directory — critically excluding
  `node_modules`, `.next`, and `.env.local` — ran `npm install` there from scratch
  (confirmed `mongodb-memory-server`'s postinstall re-downloaded its MongoDB binary
  into the new, empty `node_modules/.cache` rather than reusing anything from this
  directory), and ran both `npm test` (125/125 passing) and `npm run test:e2e`
  (3/3 passing, reusing this machine's globally-cached Playwright browser install,
  which is genuinely OS-user-scoped rather than project-local) with no `.env.local`
  present anywhere. Deleted the scratch copy afterward.

## Module 14 — Production Deployment

- **No real deployment happened in this module** — by the user's own explicit
  direction mid-module ("dev will do this so let's skip [the Vercel setup]... make
  sure it's ready for deployment"), the actual Vercel project creation, env var
  entry, and deploy trigger were handed off rather than performed. Everything below
  is either genuinely done, or is a precise, verified-as-much-as-possible checklist
  for the parts that needed direct account access this session never had.
- **Real, upfront blockers found and reported rather than worked around**: no
  GitHub remote configured at all (`git remote -v` empty, `git log` was a single
  "Initial commit from Create Next App" before this module) — the brief's premise
  that the repo was "already on GitHub" didn't hold, confirmed by checking rather
  than assumed; no `gh` CLI installed; no Vercel CLI session (`vercel whoami`
  returned "Logged out"). None of these can be resolved without the user's actual
  GitHub/Vercel account access, so they weren't faked or silently skipped — they're
  called out explicitly in `DEPLOYMENT.md` and were the subject of a direct
  mid-module question to the user.
- **Git history is two commits, not thirteen.** The brief asked for "clear,
  module-referenced commit messages" for Modules 1-13's work — all of which was
  sitting uncommitted as one flat working-tree snapshot (nothing was ever committed
  incrementally as each module was built). Manufacturing thirteen separate commits
  now, by guessing which lines of already-merged, repeatedly-edited files "belong"
  to which module, would fabricate a false incremental history rather than recover
  a real one — a file like `components/admin/ArticleForm.tsx` was touched by at
  least four different modules, and there's no way to un-mix those edits after the
  fact. Committed as two honest, clearly-labeled commits instead: one for the full
  application through Module 12, one for Module 13's test suite specifically (which
  *could* be isolated precisely, since its file set was fully known from having just
  built it in this same conversation) — each commit message says plainly what it is
  and, for the first, why it isn't split further.
- **Real discrepancy found in the brief itself**: step 6 asked to set
  `NEXT_PUBLIC_SITE_URL` in Vercel "matching NEXTAUTH_URL." Grepped the whole
  codebase — it's not read anywhere. `lib/site-config.ts`'s `SITE_URL` (used by
  `sitemap.ts`, `robots.ts`, JSON-LD, canonical/OG tags) reads only `NEXTAUTH_URL`,
  a deliberate Module 10 decision specifically to avoid two site-URL env vars
  drifting out of sync. Flagged this in `DEPLOYMENT.md` rather than silently adding
  an inert env var just because the brief listed it.
- **Build/runtime readiness was verified for real, not assumed**, using a
  temporary local MongoDB instance standing in for Atlas (same
  `mongodb-memory-server` tool used throughout this project's testing, started on
  a one-off port, torn down after): ran an actual `next build` — confirmed it
  completes cleanly and that `generateStaticParams` (which needs a real DB
  connection *at build time* for the `/articles/[slug]` route) succeeds when the
  database is reachable, which is exactly what would fail first if Vercel's build
  environment couldn't reach Atlas. Then ran an actual `next start` (production
  mode) with a realistic non-localhost `NEXTAUTH_URL` and confirmed `sitemap.xml`/
  `robots.txt` both resolved every URL against that domain — proving the
  build-time-vs-runtime env var distinction called out in `DEPLOYMENT.md` §2 is
  actually correct, not just theoretically reasoned about. Also grepped the whole
  codebase for `@vercel/*` imports, `vercel.json`, `VERCEL_*` env reads, and
  `export const runtime = "edge"` — none exist anywhere, confirming this app has
  no Vercel-specific dependency and would run unmodified on any Node.js host.
- **The new production `NEXTAUTH_SECRET` was generated but deliberately never
  printed in this conversation** — written directly to a local scratch file
  instead. Printing a freshly rotated secret in chat would immediately recreate
  the exact "visible in plaintext in scrollback" problem this module's own item 3
  exists to fix for the *old* secret. `DEPLOYMENT.md` points to the file and notes
  it should be deleted once copied into the hosting provider's env var UI.
- **The admin password rotation (item 4) and the full production smoke test
  (item 9) are both explicitly left for after a real deployment exists** — neither
  can happen against something that isn't deployed yet, and the password rotation
  specifically shouldn't involve anyone pasting the current admin password into
  this chat either. `DEPLOYMENT.md` §5 has the exact checklist to run once the app
  is live.
- **MongoDB Atlas's specific current storage usage (for the M0-ceiling note in
  item 11) was not checked** — no Atlas dashboard access. `DEPLOYMENT.md` gives
  the general M0 ceiling (512MB) and exactly where to check current usage, rather
  than inventing a specific number.
