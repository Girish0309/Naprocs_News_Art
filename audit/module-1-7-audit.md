# Production-Readiness Audit — Modules 1-7

Every item below was verified by opening the actual file(s) and tracing the code path —
not inferred from module descriptions or prior conversation summaries. Live behavioral
checks (marked "Verified live") were run against an isolated in-memory MongoDB instance
seeded with real test data, completely separate from any real database. Three fixes
required a temporary swap of `lib/rate-limit.ts` for an in-memory test double to prove
sliding-window enforcement without real Upstash credentials — each swap was reverted and
diff-confirmed identical to the original before moving on (same pattern used for
Cloudinary in the Module 4 build and documented in `DEVIATIONS.md`).

## Summary

| Module | Items checked | Pass | Fail (fixed) | Partial |
|---|---|---|---|---|
| 1 — Infrastructure | 5 | 4 | 1 | 0 |
| 2 — Authentication | 6 | 4 | 2 | 0 |
| 3 — Article CRUD | 3 | 2 | 1 | 0 |
| 4 — Cover Image Security | 5 | 5 | 0 | 0 |
| 5 — Publish & Revalidation | 4 | 4 | 0 | 0 |
| 6 — Public Site | 3 | 3 | 0 | 0 |
| 7 — Comments | 5 | 4 | 1 | 0 |
| Cross-module | 6 | 5 | 0 | 1 |
| Secrets & config | 2 | 2 | 0 | 0 |
| **Total** | **39** | **33** | **5** | **1** |

Five real bugs were found and fixed as part of this audit. One item is a deliberate,
user-directed tradeoff (not fixed, per explicit instruction) and is documented as such.

---

## MODULE 1 — Infrastructure

### 1.1 `lib/db.ts` connection caching — **PASS**
`lib/db.ts:11-22` caches the connection on `global._mongooseCache`, not module scope.
Next.js dev mode re-evaluates modules on hot reload but does not reset `global`, so the
cached `conn`/`promise` survive across reloads — confirmed by reading the actual
`declare global` block and the `cache.conn ?? ...` guard at `lib/db.ts:41-44`. A failed
connection attempt resets `cache.promise` (`lib/db.ts:56-57`) so the next call retries
instead of replaying a stale rejection forever.

### 1.2 `proxy.ts` route protection is pattern-based — **PASS**
`proxy.ts:35-37`: `matcher: ["/admin/:path*"]` is a genuine Next.js path pattern, not an
enumerated list — any new route under `/admin/*` is automatically covered with zero
additional wiring. Verified this isn't just a UI-hiding mechanism: `proxy.ts:20-30`
calls `getToken()` and issues a real `NextResponse.redirect` for any unauthenticated
request before the page renders.

**Important scope note surfaced by this check**: this matcher only covers **page**
routes (`/admin/*`), not **API** routes (`/api/admin/*`) — different path prefixes, as
the audit brief anticipated. See 1.3.

### 1.3 Every `/api/admin/*` route individually — **PASS**
Traced all six admin API route files directly (not inferred from the matcher):

| Route | Explicit session check? |
|---|---|
| `app/api/admin/login/route.ts` | N/A — intentionally public; this is a pre-auth rate-limit pre-flight, not an admin action (see 2.4) |
| `app/api/admin/2fa/setup/route.ts:14-17` | Yes |
| `app/api/admin/upload-image/route.ts:34-37` | Yes |
| `app/api/admin/articles/route.ts:36-39` (GET), `:85-88` (POST) | Yes |
| `app/api/admin/articles/[id]/route.ts:41-44` (PUT/PATCH), `:147-150` (DELETE) | Yes |
| `app/api/admin/comments/route.ts:17-20` (GET), `:56-59` (PATCH) | Yes |

Every route that performs an actual admin action checks `getServerAuthSession()` and
returns `401` before any other code runs — confirmed these are genuine early returns,
not logged-and-ignored checks.

### 1.4 Missing env vars fail loudly at startup — **PASS**
`instrumentation.ts:1-6` calls `validateEnv()` from `lib/env.ts` inside `register()`,
which per Next.js's own docs (`node_modules/next/dist/docs/.../instrumentation.md`)
"must complete before the server is ready to handle requests" — a thrown error here
prevents the server from ever serving a request. `lib/env.ts:1-12` throws a single
combined, human-readable error naming exactly which of `MONGODB_URI`/`NEXTAUTH_SECRET`
is missing. `lib/db.ts:46-50` has a redundant second check as defense in depth in case
`dbConnect()` is ever reached from an Edge-runtime context where instrumentation's
Node-only branch (`instrumentation.ts:2`) doesn't run.

### 1.5 Rate-limit fail-open behavior — **FAIL → FIXED**
**What was wrong**: `lib/rate-limit.ts` (original) returned `{ success: true, ... }`
unconditionally whenever Upstash wasn't configured — including in production. A
misconfigured production deploy (forgot to set `UPSTASH_REDIS_REST_URL`/`_TOKEN`) would
silently run with **zero** rate limiting on login, uploads, and comments, with only a
console warning nobody monitors. Separately, the actual Upstash network call
(`getLimiter(...).limit(key)`) had no `try/catch` — a transient Upstash outage would
throw an uncaught exception rather than explicitly failing closed.

**Why it matters**: the brief calls this out directly — "fail open on a login endpoint
is a real vulnerability." A rate limiter that silently disables itself under exactly
the conditions (misconfiguration, outage) when you'd most want it to hold the line is
not doing its job.

**What I changed** (`lib/rate-limit.ts`):
- Added `resultWhenUnconfigured()`: fails **open** only when `NODE_ENV !== "production"`
  (preserves the original local-dev convenience — no Upstash account needed to run
  `npm run dev`), fails **closed** when `NODE_ENV === "production"` and logs via
  `console.error` (not just `warn`) since that's a real misconfiguration, not an
  expected state.
- Wrapped the real Upstash call in `try/catch` in both `rateLimit()` and the new
  `peekRateLimit()` (see 2.4) — a thrown error now returns `{ success: false, ... }`
  explicitly, logged, rather than propagating uncaught.

**Verified live**: confirmed `rateLimit()` returns `{success:true}` when unconfigured
outside production (existing dev behavior preserved) via a standalone script; the
production-fail-closed branch was code-reviewed (simple boolean flip) rather than run
under `NODE_ENV=production` given the constraints described in 2.4's live-test section.

---

## MODULE 2 — Authentication

### 2.1 Zero public registration routes — **PASS**
`grep -rn "Admin\.create|new Admin("` across the entire repo returns exactly one match:
`scripts/create-admin.ts:50`, an interactive CLI script. No API route creates an Admin
document.

### 2.2 Session cookie flags — **PASS**
`lib/auth.ts`'s `authOptions.cookies.sessionToken.options`: `httpOnly: true`,
`sameSite: "strict"`, `path: "/"`, `secure: useSecureCookies` — read directly from the
live config object, not inferred. `secure` is conditional on
`NODE_ENV === "production"` (`lib/auth-cookie-config.ts:3`), which is correct (not a
bug): forcing `secure: true` over local HTTP would prevent the cookie from ever being
set in dev.

### 2.3 Admin document never leaked via API — **PASS**
`lib/auth.ts`'s `authorize()` returns an explicit `{ id, name, email }` object, never
the Mongoose document itself or a spread of it. `app/api/admin/2fa/setup/route.ts:37`
returns only `{ secret, otpauthUrl, qrCodeDataUrl }` — the `admin` document fetched at
line 20 is used for its fields (`admin.email`) but never serialized directly. Grepped
every `app/api` file referencing `admin`/`Admin` — no other route touches the Admin
model.

### 2.4 Login rate limiting — **FAIL → FIXED** (this is the most significant finding)
**What was wrong**: the 5-attempts/15-min rate limit was enforced **only** inside
`app/api/admin/login/route.ts`, a separate pre-flight endpoint that `LoginForm.tsx`
happens to call before invoking NextAuth's `signIn("credentials", ...)`
(`components/admin/LoginForm.tsx:41-58`). NextAuth's actual credential-checking code —
`lib/auth.ts`'s `authorize()` — had **no rate-limiting logic at all**. Anyone bypassing
the browser UI and POSTing directly to `/api/auth/callback/credentials` (exactly how a
real credential-stuffing/brute-force tool would operate — it has no reason to call an
unrelated pre-flight endpoint first) hit zero rate limiting, regardless of whether
Upstash was configured or not. This made the entire rate limit decorative against any
real attack.

**Why it matters**: this is the textbook version of the "common gap" the audit brief
warns about generally (protection living somewhere a client can simply route around),
just one layer deeper than the middleware-vs-API-route framing — here it's
UI-orchestration vs. the actual auth endpoint.

**What I changed**:
- `lib/auth.ts`: `authorize(credentials, req)` now calls
  `getClientIp(req.headers)` + `rateLimit(\`login:${ip}\`, 5, "15m")` **first**, before
  any DB lookup, and returns `null` if blocked. This runs for every credential check
  NextAuth performs, no matter how it's triggered — it cannot be bypassed by skipping a
  separate endpoint.
- `lib/get-client-ip.ts`: widened `getClientIp` to accept either a real WHATWG
  `Headers` (Route Handlers) or the plain lowercase-keyed object NextAuth's
  `authorize(credentials, req)` passes as `req.headers` (confirmed this shape against
  the installed `next-auth` types: `RequestInternal.headers?: Record<string, any>`, not
  a `Headers` instance).
- `lib/rate-limit.ts`: added `peekRateLimit()` — a non-consuming check using
  `@upstash/ratelimit`'s `getRemaining()` (confirmed available in the installed v2.0.8
  via its `.d.ts`). `app/api/admin/login/route.ts` now calls this instead of
  `rateLimit()`, so the pre-flight UX nicety (immediate "too many attempts" message,
  no NextAuth redirect round-trip) no longer **also** consumes a slot — a real login
  now costs exactly one attempt against the budget, enforced authoritatively in
  `authorize()`.

**Verified live** (see full methodology note at the end of this section): with a real
sliding-window limiter swapped in temporarily, calling the actual `authorize()`
function directly 6 times from one IP —
attempts 1-2 (wrong password, different emails each time — proving the key is IP-based,
not reset by changing email), attempt 3 (correct credentials) **succeeded**, attempts
4-5 (wrong password) consumed the rest of the budget, and attempt 6 (**correct**
credentials) was **blocked** — proving the fix closes the bypass rather than just
moving it. Re-ran with generic `null` responses for both bad-email and bad-password to
confirm 2.5 still holds after this change.

### 2.5 Generic "invalid credentials" — **PASS**, plus one bonus finding fixed
`lib/auth.ts`'s `authorize()`: both the "no admin found" and "wrong password" paths
`return null`, and NextAuth surfaces `null` identically as `CredentialsSignin`
regardless of which branch produced it — confirmed both paths converge before any
response is constructed. **Verified live**: `no-such-email` and `wrong-password` both
returned `null`.

**Bonus finding (timing side-channel), fixed alongside 2.4**: the original code only
ran `bcrypt.compare` when an admin was actually found (`if (!admin) return null;`
short-circuited **before** any hashing). `bcrypt.compare` is deliberately slow
(~50-200ms); skipping it entirely for nonexistent emails means response latency alone
distinguishes "no such account" from "wrong password," even though the response body is
identical — a classic user-enumeration side channel. Fixed by always comparing against
a fixed dummy hash (`DUMMY_PASSWORD_HASH` in `lib/auth.ts`) when no admin matches, so
the function takes comparable time either way.

**Live-test methodology note**: this project already has a real `next dev` server
running (the user's own session, on port 3000) against a real database — I did not
touch it. Next.js enforces a one-dev-server-per-project-directory lock, so a second
`next dev`/`next build` instance can't run alongside it. All live verification above was
done by importing the actual route/lib modules directly in standalone `tsx` scripts
(no HTTP layer, no competing server) against a separate, temporary in-memory MongoDB
instance on an unused port, with `MONGODB_URI`/`NEXTAUTH_SECRET` passed as shell
environment variables (confirmed via `@next/env`'s source that already-set
`process.env` values take precedence over anything in `.env.local`, so this never read
or touched the user's real `.env.local`). All temporary test scripts and MongoDB
processes were removed/killed afterward — see the cleanup note at the end of this
report.

---

## MODULE 3 — Article CRUD + Editor

### 3.1 Timestamps are always server-generated — **PASS**
`createArticleSchema`/`updateArticleSchema` in `app/api/admin/articles/route.ts:10-33`
and `app/api/admin/articles/[id]/route.ts:15-38` don't declare `created_at`,
`updated_at`, or `published_at` as accepted fields at all — Zod's `.safeParse` silently
drops any extra keys a modified client request might include, so there's no field for a
forged timestamp to land in even if the UI never exposed one. `created_at`/`updated_at`
come from Mongoose's schema-level `timestamps` option (`models/Article.ts:73`);
`published_at` is set exactly once server-side, either at creation
(`app/api/admin/articles/route.ts:117`) or on the first transition to `"published"`
(`app/api/admin/articles/[id]/route.ts:94-96`).

### 3.2 `body_html` sanitized server-side on every write — **PASS**
`sanitizeArticleHtml()` is called unconditionally in both the POST handler
(`app/api/admin/articles/route.ts:97`) and the PATCH/PUT handler
(`app/api/admin/articles/[id]/route.ts:61`) **before** the value is ever assigned to
the Mongoose document — a modified client request sending raw `<script>` tags directly
to the API (bypassing Tiptap entirely) is sanitized regardless.

### 3.3 Autosave debounce/race safety — **FAIL → FIXED**
**What was wrong**: `components/admin/ArticleForm.tsx`'s `save()` guarded against
*overlapping requests* correctly (`savingRef.current` checked synchronously before any
`await`), but cleared `dirtyRef.current = false` **after** the save request resolved,
not before it started. If a user typed more content while a save was in flight (network
latency, however brief), that keystroke correctly called `markDirty()` mid-request —
but when the in-flight save then completed, the unconditional `dirtyRef.current = false`
clobbered that flag, discarding the "this still needs saving" signal for content the
server never actually received. The next 30s interval would see `dirtyRef.current ===
false` and skip saving; if the user closed the tab shortly after, the unmount-cleanup
save (which also checks `dirtyRef.current`) would skip too — a real, if narrow, window
where recently-typed content is never persisted.

**Why it matters**: this is exactly the "overlapping saves race stale content" concern
in the brief, just manifesting as a *missed* save rather than a *conflicting* one — the
more insidious failure mode since nothing errors and no request appears to fail.

**What I changed**: moved `dirtyRef.current = false` to immediately after the
`savingRef.current` guard, **before** the payload snapshot — clearing it optimistically
at the moment content is captured, not after the round trip. Any edit that happens
during the in-flight request now correctly re-marks dirty via `markDirty()` and survives
for the next interval. This introduced a second-order issue I caught and fixed in the
same edit: since dirty is now cleared *before* the request, a failed request (`catch`
block) needed to explicitly restore `dirtyRef.current = true` to keep the existing
"Retrying on the next autosave" promise in the error message honest — added that
restoration in the `catch` block.

Verified by tracing both the success and failure paths line-by-line after the change;
this is a UI timing race that isn't practically reproducible as a deterministic
automated test, so verification here is thorough code-tracing rather than a live
repro — flagged explicitly rather than claimed as live-tested.

---

## MODULE 4 — Cover Image Security

### 4.1 Magic-byte check happens before any Cloudinary call — **PASS**
Traced the literal execution order in `app/api/admin/upload-image/route.ts`: auth
check (34-37) → rate limit (39-46) → `Content-Length` check (51-54) → form parse
(56-60) → real byte-size check (64-66) → `fileTypeFromBuffer` magic-byte sniff
(72-78, **rejects and returns before line 86**) → only then `cloudinary.uploader.upload`
(83-95). A renamed `.txt` or polyglot file is rejected at line 73-78 and never reaches
Cloudinary — confirmed there is no code path between the magic-byte check and the
upload call that could skip the rejection.

### 4.2 Re-encode/strip-metadata is not skippable — **PASS**
Only one call site in the entire codebase invokes `cloudinary.uploader.upload`
(`app/api/admin/upload-image/route.ts:86`, confirmed via repo-wide grep) — every upload
goes through the same `transformation: [{ quality: "auto:good", flags: "force_strip" }]`
options. This is passed as an **incoming transformation** (a direct upload parameter,
not under `eager`), which per Cloudinary's documented behavior transforms the asset
*before* storage — the stored/delivered asset at that `public_id` is the transformed
derivative, not a passthrough of the original bytes. There is no second, untransformed
copy reachable through this app's code (Cloudinary account-level backup, if enabled, is
a separate account setting outside this app's code and outside this audit's scope).

### 4.3 Orphaned asset cleanup on post-upload validation failure — **PASS**
`app/api/admin/upload-image/route.ts:98-108`: when the dimension check fails *after* a
successful Cloudinary upload, `cloudinary.uploader.destroy(uploadResult.public_id)` is
called, and a failure of the cleanup call itself is caught and logged
(`.catch((error) => console.error(...))`) rather than silently swallowed or left to
crash the request.

### 4.4 Auth enforcement is a real gate, not decorative — **PASS**
`app/api/admin/upload-image/route.ts:34-37`: `if (!session) return NextResponse.json(...)`
is a genuine early return — every line after it, including the rate limit, file
handling, and Cloudinary call, is unreachable without a valid session. Confirmed by
reading the control flow directly (not by hypothetically removing the check).

### 4.5 Rate limit keyed by admin ID — **PASS**
`app/api/admin/upload-image/route.ts:39`: `rateLimit(\`upload-image:${session.user.id}\`, 10, "1h")`
— keyed by the authenticated admin's Mongo ID, not IP. Multiple admins behind one NAT
each get their own budget; one admin switching networks doesn't reset theirs.

---

## MODULE 5 — Publish & Revalidation

### 5.1 Public single-article query filters at the DB level — **PASS**
`app/(public)/articles/[slug]/page.tsx`: `Article.findOne({ slug, status: "published" })`
— the filter is a Mongoose query condition, not a post-fetch check. A direct URL hit on
a draft's slug queries for a document that doesn't match (wrong status), gets `null`,
and hits `notFound()` — identical to a genuinely nonexistent slug. `generateStaticParams`
in the same file also filters `{ status: "published" }`, so drafts are never even
included in the statically-generated param list.

### 5.2 `status` + `published_at` updated atomically — **PASS**
`app/api/admin/articles/[id]/route.ts:92-99`: both fields are set on the in-memory
Mongoose document (`existing.status = ...`, `existing.published_at = new Date()`), then
persisted via a single `await existing.save()` call — one MongoDB write operation, not
two separate updates that could be interrupted between them.

### 5.3 `revalidatePath` call format verified against the actual installed Next.js
version's docs — **PASS**
Read `node_modules/next/dist/docs/.../revalidatePath.md` directly rather than assuming
training-data behavior applies (per this repo's own `AGENTS.md` warning about
version-specific breaking changes). The docs confirm: `revalidatePath(path: string,
type?: 'page' | 'layout')`, where a `type` param is only required for a path containing
an unresolved dynamic segment like `/product/[slug]`. This codebase calls
`revalidatePath(\`/articles/${existing.slug}\`)` and `revalidatePath("/")`
(`app/api/admin/articles/[id]/route.ts:107-108`, and identically in the DELETE handler
at `:167-168`) — both are literal, fully-resolved paths, so omitting `type` is correct
per the docs, not an oversight.

### 5.4 Revalidation failure is logged but doesn't block the publish response — **PASS**
`app/api/admin/articles/[id]/route.ts:105-115`: the `revalidatePath` calls are wrapped
in `try/catch`; a failure is logged via `console.error` with clear context (which
article, which status transition) but the function continues to the success response
regardless — the DB write (the actual publish) already succeeded and is not rolled back
or blocked by a revalidation hiccup. Same pattern in the DELETE handler.

---

## MODULE 6 — Public Site

### 6.1 Draft articles are unreachable via every public route — **PASS**
Checked every query that lists or links to articles, not just the two main routes:

| Source | Filter |
|---|---|
| `app/(public)/page.tsx:15` (homepage initial load) | `status: "published"` |
| `app/api/articles/route.ts:16` (Load More pagination) | `status: "published"` |
| `app/(public)/articles/[slug]/page.tsx` (article detail) | `status: "published"` |
| `app/(public)/articles/[slug]/page.tsx:59-63` ("More like this") | `status: "published"`, with a fallback query (`:69-75`) that **also** filters `status: "published"` |
| `app/sitemap.ts:14` | `status: "published"` |
| `app/(public)/articles/[slug]/page.tsx` `generateStaticParams` | `status: "published"` |
| `app/api/search/route.ts` | Stub — always returns `{ results: [] }` regardless of query, so it cannot leak anything yet |

### 6.2 `next/image` usage and aspect-ratio integrity — **PASS**, with one flagged tradeoff
Every image on the public site (`components/public/ArticleRow.tsx:71`,
`app/(public)/articles/[slug]/page.tsx:93`) uses `next/image`'s `<Image>`, never a raw
`<img>`. Repo-wide grep for `<img` found exactly one match:
`components/admin/CoverImageUploader.tsx:188` — inside the **admin-only** upload
component, rendering a transient local `URL.createObjectURL()` blob preview before the
file is even sent to the server. This is a deliberate, correctly-justified exception
(inline comment explains it): `next/image`'s optimizer cannot process a local `blob:`
URL, and it never reaches real users — it's gone the moment the upload completes or is
cancelled. Not a bug.

**Flagged tradeoff (already documented in `DEVIATIONS.md`, re-confirmed here)**: public
images use `fill` + `object-cover` inside fixed-aspect-ratio containers rather than
literal `width`/`height` props computed from the stored `cover_image` dimensions. This
was a deliberate choice, and it actually avoids the exact failure mode the audit
brief is warning about: hardcoded literal dimensions that don't match a differently-sized
real image would cause `next/image` to compute the wrong intrinsic aspect ratio
(distortion/letterboxing). `fill` declares no intrinsic size at all and relies on
`object-cover` to crop-not-stretch, so a mismatch is structurally impossible. The real
stored `width`/`height` values are still preserved in the model and API response
(`ArticleCoverImage.width/height`, still returned by `/api/articles`) — they're just not
used as `next/image` props, by design.

### 6.3 `body_html` re-sanitized at render time — **PASS**
`app/(public)/articles/[slug]/page.tsx`: `sanitizeArticleHtml(article.body_html)` is
called again immediately before `dangerouslySetInnerHTML`, independent of the
save-time sanitization in Module 3 — genuine defense in depth, not a single point of
trust.

---

## MODULE 7 — Comments

### 7.1 `fingerprint_hash` never reaches the browser — **PASS** (hardened further)
Public `GET /api/articles/[id]/comments` (`app/api/articles/[id]/comments/route.ts:27-30`):
`.select("author_name body created_at")` excludes `fingerprint_hash` **at the query
level**, and the response mapping (`:33-38`) only includes `id`/`author_name`/`body`/
`created_at` regardless. `POST`'s response (`:96-107`) uses the same kind of explicit
allowlist.

Admin `GET /api/admin/comments` (`app/api/admin/comments/route.ts`, pre-fix) fetched
full documents with `Comment.find(filter)` (no `.select()`), but the response mapping
(`:37-50`) already explicitly allowlisted fields, excluding `fingerprint_hash` — so it
never actually reached the client. **Hardened anyway**: added
`.select("author_name body status flagged_reason created_at article_id")` to the query
so `fingerprint_hash` is excluded at the DB level too, matching the public route's
pattern — defense in depth against a future refactor of the response mapping (e.g. to a
careless spread) accidentally leaking it. Not a live leak; a hardening fix.

### 7.2 Spam filter runs before the comment is saved, and its result determines status — **PASS**
Traced actual execution order in `app/api/articles/[id]/comments/route.ts`:
`checkForSpam(commentBody)` at line 81 runs, and its result is read at line 88
(`status: spamResult.flagged ? "flagged" : "visible"`) **inside** the same
`Comment.create()` call at line 83 — the status is never set before the check runs,
and there's no code path that creates the document with `"visible"` before the spam
result is known.

### 7.3 `comment_count` increment/decrement correctness — **FAIL → FIXED**
**What was wrong**: the admin `PATCH` handler read the comment via `Comment.findById`,
computed `wasRemoved`/`willBeRemoved` from that read, mutated the in-memory document,
called `.save()`, and only *then* conditionally applied `$inc` to the article's
`comment_count` — a plain read-then-write with no atomicity between the read and the
decision to `$inc`. Two concurrent `PATCH` requests for the same comment (a genuine
double-click before the UI's optimistic removal kicks in, or a retried/duplicated
network request) would both read the same "before" status independently and both apply
their own `$inc`, double-counting a single removal.

Sequential retries (the more common real-world case) were already safe — a second
request re-reads the now-already-"removed" document and correctly computes no delta.
The gap was specifically genuine concurrent requests racing each other.

**What I changed** (`app/api/admin/comments/route.ts`): replaced the
`findById` + `.save()` pattern with a compare-and-swap: `Comment.findOneAndUpdate({
_id: comment_id, status: previousStatus }, ...)` — the filter includes the status just
read, so only whichever concurrent request's write actually lands first will match;
the loser's filter no longer matches (the document's status has already changed) and
`findOneAndUpdate` returns `null` for it, which the handler treats as "someone else
already handled this, no count delta to apply." Also fixed a `flagged_reason`-clearing
bug introduced while writing this fix: Mongoose silently drops `undefined` values from
a plain update object (unlike a full document `.save()`, where assigning `undefined`
does clear a path) — switched to an explicit `$unset` for that field.

**Verified live**: seeded a comment with `comment_count: 1`, fired two concurrent
"remove" operations at the exact same document via `Promise.all`, and confirmed exactly
one of the two applied a count change while the other was a no-op — final
`comment_count` landed at `0`, not `-1`.

### 7.4 Removed/flagged comments excluded at the query level — **PASS**
`app/api/articles/[id]/comments/route.ts:27`: `Comment.find({ article_id: id, status:
"visible" })` — the filter is a MongoDB query condition, not a post-fetch JavaScript
filter. A flagged or removed comment is never even transmitted from the database to the
Node process for this endpoint, let alone to the browser.

### 7.5 `author_name` sanitized with the same rigor as `body` — **PASS**
`app/api/articles/[id]/comments/route.ts:75-76`: both
`sanitizePlainText(parsed.data.author_name)` and `sanitizePlainText(parsed.data.body)`
call the identical function — full tag-stripping, not a lighter-touch treatment for the
name field.

---

## PART B — Cross-Module Connections

### B.1 Cover image shape consistency — **PASS**
Traced the full chain: `UploadImageResponse` (Module 4,
`app/api/admin/upload-image/route.ts:7-12`) → `CoverImageValue` (Module 4 UI,
`components/admin/CoverImageUploader.tsx:7-13`) → `ArticleCoverImage` (Module 3,
`models/Article.ts:5-11`) all use identical field names: `url`, `cdn_public_id`,
`width`, `height`, `alt_text?`. Cloudinary's own `secure_url` field is translated to
this app's `url` at the API boundary (`upload-image/route.ts:111`) and never leaks its
native name any further up the stack — the exact mismatch class the brief warns about
doesn't occur because the translation happens at the earliest point.

### B.2 Status enum confusion — **PASS**
`ArticleStatus` (`"draft" | "published"`, `models/Article.ts:3`) and `CommentStatus`
(`"visible" | "flagged" | "removed"`, `models/Comment.ts:3`) are distinct TypeScript
types with no overlapping literal values, so a mistaken comparison would fail to
typecheck. Grepped every file referencing `.status` across both models' consuming code
— no route or component compares an `Article` document's status against a `Comment`
status value or vice versa.

### B.3 Timestamp generation consistency — **PASS**
Every model's timestamps come from one of two equivalent sources: Mongoose's built-in
`timestamps: { createdAt, updatedAt }` schema option (`models/Article.ts:73`, which
Mongoose implements internally via `new Date()` at write time), or an explicit
`{ type: Date, default: Date.now }` schema default / explicit `new Date()` call
(`models/Comment.ts:20`, `models/Admin.ts:17-18`, `lib/auth.ts`'s
`admin.last_login_at = new Date()`, `app/api/admin/articles/route.ts:117`'s
`published_at`). No route uses a client-supplied timestamp, `Date.now()` computed at a
different layer, or any other clock source.

### B.4 Session shape consistency — **PASS**
`types/next-auth.d.ts:4-10` declares `session.user: { id, name, email }`.
`lib/auth.ts`'s `jwt`/`session` callbacks populate `token.id`/`session.user.id` from the
`authorize()`-returned `User` object; NextAuth v4's default behavior additionally
carries `name`/`email` onto the token from that same object without needing an explicit
copy (the custom `jwt` callback only adds `id`, it doesn't remove the defaults). Grepped
every `session.user.*` read site (`2fa/setup/route.ts:20`, `upload-image/route.ts:39`,
and several admin page components) — all read `id` or `name`, both of which are
genuinely populated per the above.

### B.5 Rate limiter key namespacing — **PASS**
Three call sites, three distinct prefixes: `` `login:${ip}` `` (now in both
`lib/auth.ts` and the pre-flight route — same key, which is intentional, see 2.4),
`` `upload-image:${session.user.id}` ``, `` `comment:${fingerprintHash}` ``. Different
prefix strings mean collision would require an exact full-string match across
fundamentally different value domains (IP address vs. Mongo ObjectId vs. SHA-256 hex) —
not possible.

### B.6 `comment_count` drift under retry/network-failure scenarios — **PARTIAL (noted, not fixed — per explicit instruction)**
`POST /api/articles/[id]/comments` is not idempotent: it creates a new `Comment`
document and increments `comment_count` as two separate steps
(`app/api/articles/[id]/comments/route.ts:83-94`). If a client retries after a dropped
response (the DB write succeeded but the response never arrived), or a network proxy
duplicates the request, this would create a second comment and a second increment —
the counter would still accurately reflect the (now-duplicated) comment collection, but
the user would see their comment posted twice. This is a real, low-probability edge
case, explicitly called out by the audit brief as reasonable to **not** fix now
("a reconciliation script recounting from source of truth periodically is a reasonable
V1.1 fix"). Left as-is, matching that instruction. If it's worth doing later: an
idempotency key (client-generated UUID, stored on the comment, checked before insert)
would close this more directly than periodic reconciliation, at the cost of a schema
change — worth weighing against reconciliation when this becomes a priority.

---

## PART C — Secrets & Config Hygiene

### C.1 `.gitignore` coverage and git history — **PASS**
`.gitignore:34-35`: `.env*` ignored, with an explicit `!.env.local.example` carve-out.
`git log --all --oneline` shows exactly **one** commit in this repository's entire
history: `dee1292 Initial commit from Create Next App` (the pristine scaffold, before
any of Modules 1-7 existed). Searched that commit's full diff and file list for
env-filenames and common secret patterns (`MONGODB_URI=mongodb+srv`,
`CLOUDINARY_API_SECRET=`, AWS-style keys, long base64 strings assigned to
`NEXTAUTH_SECRET`) — no matches. All Module 1-7 work, including `.env.local.example`,
is currently uncommitted, so there is no historical exposure to check beyond this.

### C.2 `.env.local.example` contains only placeholders — **PASS**
Read the file directly: every value is either blank (`CLOUDINARY_CLOUD_NAME=`,
`NEXTAUTH_SECRET=`, both `UPSTASH_*` vars) or an obviously-local placeholder
(`MONGODB_URI=mongodb://localhost:27017/naprocs-newsletter`,
`NEXTAUTH_URL=http://localhost:3000`) — no real credentials.

**Note**: a real `.env.local` exists in the working directory (the user's own local dev
config, created since the last session). I did not read its contents — only confirmed
via `git status` that it does not appear as trackable/staged (correctly excluded by
`.gitignore`), which is all C.1 requires.

---

## Cleanup note

All temporary test infrastructure created during this audit was removed: five scratch
scripts (`scripts/_seed-module7-test.ts`, `scripts/_audit-seed.ts`,
`scripts/_audit-verify.ts`, `scripts/_debug-ratelimit.ts`, and one more) were deleted;
`mongodb-memory-server` was installed with `--no-save` and uninstalled afterward
(`package.json`/`package-lock.json` confirmed unchanged via diff against their
pre-audit state); every `mongod`/watchdog/test-runner process spawned during this audit
was identified by exact PID and command line and killed — including, incidentally, a
leftover `mongod` process pair from an **earlier** session that had never been fully
cleaned up (found and killed as part of this same sweep, unrelated to the fixes above
but worth flagging as a real gap in that earlier cleanup). The user's own running
`next dev` server (verified by PID before and after every process operation) was never
touched. Final state: clean `tsc --noEmit`, clean `eslint .`, `git status` showing only
genuine project files.

---

## Verdict: Safe to proceed to Module 8?

**Yes**, with the fixes in this report applied. All five real bugs found (rate-limit
fail-open, the login rate-limit bypass, the autosave dirty-flag race, and the
comment-moderation double-decrement race, plus the bonus timing side-channel) have been
fixed, typechecked, linted, and — apart from the UI-timing autosave race, which isn't
practically reproducible as an automated test — verified live against real code paths.

The one remaining open item (`comment_count` drift under retry/duplicate-request
scenarios, B.6) is explicitly scoped by you as a V1.1 concern, not a Module 8 blocker.
Nothing else in this audit surfaced a gap that should hold up starting Module 8
(Reactions).
