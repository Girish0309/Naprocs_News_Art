# Test Case Matrix

This is the spec the automated suite (`tests/unit/`, `tests/integration/`, `e2e/`) is
written against — drafted before any test code, then implemented row by row. Rows are
grouped by the module that introduced the behavior, matching `DEVIATIONS.md`'s own
module numbering. Priority rows explicitly called out in the Module 13 brief (scenarios
the Module 1-7 and Module 11 audits proved matter, because they're exactly where real
bugs were previously found) are marked **(priority)** in the Scenario column.

All integration tests run against a real `mongodb-memory-server` instance (never the
real dev/production database — see `tests/setup/global-setup.ts`) and call the actual
exported route handler functions with a real `NextRequest`, not a mocked version of the
route itself. The one framework-level seam that's mocked in session-gated routes is
`getServerAuthSession()` (see the note after the table) — every route's own Zod
validation, Mongoose query, and business logic runs for real.

Module 6 (Public Restyle) and Module 12 (Consistency/Missing Screens) introduced no new
server-side behavior beyond what's already covered under the modules that own that
behavior (e.g. publish validation is Module 3/10, not Module 6) — their own screens are
exercised by the E2E flows (T-096/T-097) rather than getting dedicated rows here.

| ID | Module | Scenario | Expected Result | Test Type | Automated |
|---|---|---|---|---|---|
| T-001 | 1 — Infra | `validateEnv()` with `MONGODB_URI` unset | Throws, message names the missing variable | unit | Yes |
| T-002 | 1 — Infra | `validateEnv()` with `NEXTAUTH_SECRET` unset | Throws, message names the missing variable | unit | Yes |
| T-003 | 1 — Infra | `validateEnv()` with both set | Returns without throwing | unit | Yes |
| T-004 | 1 — Infra | `getClientIp()` with a comma-separated `x-forwarded-for` | Returns the first IP in the list, trimmed | unit | Yes |
| T-005 | 1 — Infra | `getClientIp()` with only `x-real-ip` set | Falls back to `x-real-ip` | unit | Yes |
| T-006 | 1 — Infra | `getClientIp()` with neither header | Returns `"unknown"` | unit | Yes |
| T-007 | 1 — Infra | `dbConnect()` called twice | Returns the same cached mongoose connection object both times | integration | Yes |
| T-008 | 2 — Auth | `authorize()` with missing email or password | Returns `null` before touching the DB | integration | Yes |
| T-009 | 2 — Auth | **(priority)** 6 login attempts from the same IP hit `authorize()` directly — **never call `/api/admin/login`** | The 6th call returns `null` (rate-limited) purely from `authorize()`'s own enforcement | integration | Yes |
| T-010 | 2 — Auth | **(priority)** `authorize()` with a nonexistent email vs. an existing email + wrong password | `bcrypt.compare` is invoked exactly once in both cases (dummy-hash path taken when no admin matches) | integration | Yes |
| T-011 | 2 — Auth | `authorize()` with an existing email, wrong password | Returns `null` | integration | Yes |
| T-012 | 2 — Auth | `authorize()` with correct credentials | Returns the user object; `last_login_at` is updated on the Admin document | integration | Yes |
| T-013 | 2 — Auth | `POST /api/admin/login` under the shared limit | `200 { ok: true }` | integration | Yes |
| T-014 | 2 — Auth | `POST /api/admin/login` once `login:<ip>` is already exhausted | `429` with a `Retry-After` header | integration | Yes |
| T-015 | 2 — Auth | `POST /api/admin/2fa/setup` with no session | `401` | integration | Yes |
| T-016 | 2 — Auth | `POST /api/admin/2fa/setup` authenticated | `200`, response has `secret`/`otpauthUrl`/`qrCodeDataUrl`; Admin's `totp_secret` is persisted | integration | Yes |
| T-017 | 2 — Auth | `POST /api/admin/change-password` with no session | `401` | integration | Yes |
| T-018 | 2 — Auth | `POST /api/admin/change-password` with wrong current password | `400`, specific error message | integration | Yes |
| T-019 | 2 — Auth | `POST /api/admin/change-password` with correct current password | `200`; the new password authenticates on the next `authorize()` call, the old one no longer does | integration | Yes |
| T-020 | 2 — Auth | 6th `change-password` attempt within an hour for the same admin | `429` | integration | Yes |
| T-021 | 3 — Article CRUD | `POST /api/admin/articles` with no session | `401` | integration | Yes |
| T-022 | 3 — Article CRUD | `POST` a new article | `201`; slug generated from the title | integration | Yes |
| T-023 | 3 — Article CRUD | `slugify()` on mixed-case/punctuated input | Lowercase, hyphenated, non-alphanumeric collapsed, capped at 96 chars | unit | Yes |
| T-024 | 3 — Article CRUD | `POST` two articles with the same title | Second gets a `-2` suffixed slug | integration | Yes |
| T-025 | 3 — Article CRUD | `PATCH` an article without changing `title` | Slug is unchanged | integration | Yes |
| T-026 | 3 — Article CRUD | `PATCH` an article, changing `title` | A new unique slug is generated | integration | Yes |
| T-027 | 3 — Article CRUD | `DELETE` an article with comments and reactions attached | Article, its comments, and its reactions are all removed | integration | Yes |
| T-028 | 3 — Article CRUD | `GET` admin article list with `status`/`page`/`limit` | Filters correctly, paginates correctly | integration | Yes |
| T-029 | 3 — Article CRUD | ArticleForm's autosave dirty-flag race (audit finding 3.3) | — | — | **No** — see note 1 below |
| T-030 | 3 — Article CRUD | Publish with no title | `400`, message lists "a title" | integration | Yes |
| T-031 | 3 — Article CRUD | Publish with empty/whitespace-only body | `400`, message lists "body content" | integration | Yes |
| T-032 | 3 — Article CRUD | Publish with no cover image | `400`, message lists "a cover image" | integration | Yes |
| T-033 | 3 — Article CRUD | Publish with a cover image but no alt text | `400`, message lists "alt text for the cover image" | integration | Yes |
| T-034 | 3 — Article CRUD | Publish with every required field present | `200`/`201`; `status: "published"`, `published_at` set | integration | Yes |
| T-035 | 3 — Article CRUD | Save a body containing a `<script>` tag | Stored `body_html` has the tag stripped | integration | Yes |
| T-036 | 3 — Article CRUD | Save a draft with no cover image/alt text | Succeeds (only the publish action is gated) | integration | Yes |
| T-037 | 4 — Cover Upload | `POST /api/admin/upload-image` with no session | `401` | integration | Yes |
| T-038 | 4 — Cover Upload | Upload exceeding `MAX_FILE_SIZE_BYTES` per `Content-Length` | `413`, before the body is even read | integration | Yes |
| T-039 | 4 — Cover Upload | Upload with a lying/absent `Content-Length` but an oversized real body | `413`, caught by the post-parse `file.size` check | integration | Yes |
| T-040 | 4 — Cover Upload | **(priority)** Upload a `.txt` file renamed with a `.jpg`/image MIME | `400` — real magic bytes don't match any allow-listed type | integration | Yes |
| T-041 | 4 — Cover Upload | **(priority)** Upload a real JPG/PNG/WEBP (magic-byte verified) | `200`, returns `url`/`cdn_public_id`/`width`/`height` (Cloudinary mocked) | integration | Yes |
| T-042 | 4 — Cover Upload | **(priority)** Upload with dimensions under 1440×900 (mocked Cloudinary response) | `400`; `cloudinary.uploader.destroy` is called to clean up the orphaned asset | integration | Yes |
| T-043 | 4 — Cover Upload | 11th upload within an hour for the same admin | `429` | integration | Yes |
| T-044 | 5 — Publish/ISR | `PATCH` setting `status: "published"` on a draft | `revalidatePath` is called for `/articles/<slug>` and `/` | integration | Yes |
| T-045 | 5 — Publish/ISR | `PATCH` setting `status: "draft"` on a published article | `revalidatePath` is still called (unpublish must go live immediately too) | integration | Yes |
| T-046 | 5 — Publish/ISR | `DELETE` a published article | `revalidatePath` is called | integration | Yes |
| T-047 | 5 — Publish/ISR | `PATCH` with no `status` field (ordinary autosave) | `revalidatePath` is never called | integration | Yes |
| T-048 | 5 — Publish/ISR | `revalidatePath` throws (mocked) during a publish `PATCH` | The `200` response and DB write still succeed; error is caught, not propagated | integration | Yes |
| T-049 | 7 — Comments | `GET` public comments for an article with mixed statuses | Only `status: "visible"` comments are returned | integration | Yes |
| T-050 | 7 — Comments | **(priority)** `POST` a comment with `Origin: https://evil.example` | `403` — CSRF same-origin check rejects it | integration | Yes |
| T-051 | 7 — Comments | `POST` a comment against a **draft** article's id | `404` — identical to a nonexistent id | integration | Yes |
| T-052 | 7 — Comments | `POST` a comment against a nonexistent article id | `404` | integration | Yes |
| T-053 | 7 — Comments | `POST` a comment body containing HTML tags | Stored `body`/`author_name` have all markup stripped | integration | Yes |
| T-054 | 7 — Comments | `POST` a comment containing a spam keyword | Stored with `status: "flagged"`, `flagged_reason` set; `comment_count` still increments | integration | Yes |
| T-055 | 7 — Comments | `POST` a comment containing 2+ links | Flagged for links, same as a keyword match | integration | Yes |
| T-056 | 7 — Comments | 6th comment within 15 minutes from the same fingerprint | `429` | integration | Yes |
| T-057 | 7 — Comments | `POST` with empty `author_name`/`body` | `400` (Zod) | integration | Yes |
| T-058 | 7 — Comments | `GET /api/admin/comments` with no session | `401` | integration | Yes |
| T-059 | 7 — Comments | `GET /api/admin/comments` with no `status` query param / with an invalid one | Defaults to `flagged`; an invalid enum value 400s rather than silently returning everything | integration | Yes |
| T-059b | 7 — Comments (post-launch) | `GET /api/admin/comments?status=all` | Returns comments of every status together, each with its article populated — the admin console's "All" tab (Comments moderation was flagged-only until this addition; see `DEVIATIONS.md`'s post-launch section) | integration | Yes |
| T-060 | 7 — Comments | **(priority)** Two concurrent `PATCH` requests both moving the same comment to `"removed"` | `comment_count` is decremented exactly **once**, not twice (compare-and-swap) | integration | Yes |
| T-061 | 7 — Comments | `PATCH` moving a comment from `"removed"` back to `"visible"` | `comment_count` is incremented again | integration | Yes |
| T-062 | 7 — Comments | `PATCH /api/admin/comments` with no session | `401` | integration | Yes |
| T-063 | 8 — Reactions | `POST` a reaction with a forged `Origin` | `403` | integration | Yes |
| T-064 | 8 — Reactions | First `like` from a fingerprint | Reaction created, `like_count` +1 | integration | Yes |
| T-065 | 8 — Reactions | Same fingerprint sends `like` again | Un-reacts: reaction deleted, `like_count` -1 | integration | Yes |
| T-066 | 8 — Reactions | Fingerprint switches from `dislike` to `like` | One call: `dislike_count` -1 **and** `like_count` +1 | integration | Yes |
| T-067 | 8 — Reactions | `POST` a reaction against a draft article | `404` | integration | Yes |
| T-068 | 8 — Reactions | 31st reaction within 15 minutes from the same fingerprint | `429` | integration | Yes |
| T-069 | 8 — Reactions | **(priority)** 10 concurrent `like` `POST`s from the same fingerprint (`Promise.all`) | Ends in exactly one consistent reaction row; no duplicate-key crash, no 500 | integration | Yes |
| T-070 | 8 — Reactions | `GET` reaction state for a draft/nonexistent article | `404` | integration | Yes |
| T-071 | 8 — Reactions | `GET` reaction state after a prior like | Returns `reaction: "like"` and the current counts | integration | Yes |
| T-072 | 9 — Search | **(priority)** Public `/api/search` with a query matching both a draft and a published article | Only the published one is returned | integration | Yes |
| T-073 | 9 — Search | Public `/api/search` with an empty/missing `q` | `400` | integration | Yes |
| T-074 | 9 — Search | **(priority)** Admin `GET /api/admin/articles?q=...` matching a draft | The draft **is** returned (admin search has no status restriction) | integration | Yes |
| T-075 | 9 — Search | `pageParam`/`limitParam` given non-numeric/out-of-range input | Silently clamp/fall back to defaults, never throw | unit | Yes |
| T-076 | 9 — Search | `boundedTextParam` given an empty string or one past `maxLength` | Fails Zod validation | unit | Yes |
| T-077 | 9 — Search | `scripts/backfill-body-text.ts` | — | — | **No** — see note 2 below |
| T-078 | 10 — SEO | **(priority)** `sitemap()` with one draft and one published article | Only the published article's URL is included | integration | Yes |
| T-079 | 10 — SEO | `sitemap()` entry for an edited article | `lastModified` uses `updated_at`, not `published_at` | integration | Yes |
| T-080 | 10 — SEO | **(priority)** Public `GET /api/articles` (homepage listing) with a draft present | The draft is excluded | integration | Yes |
| T-081 | 10 — SEO | **(priority)** The real `ArticlePage` server component called for a draft's slug | Throws the `notFound()` digest (`NEXT_HTTP_ERROR_FALLBACK;404`) | integration | Yes |
| T-082 | 10 — SEO | `generateMetadata()` for a draft's slug | Returns `{}` — no title/description leaked | integration | Yes |
| T-083 | 10 — SEO | **(priority)** The "more like this" related-articles query, run against a mix of drafts, the current article, and other published articles | Excludes drafts and the current article itself | integration | Yes |
| T-084 | 11 — Security | `isSameOriginRequest()` with a matching `Origin` | `true` | unit | Yes |
| T-085 | 11 — Security | `isSameOriginRequest()` with a mismatched `Origin` | `false` | unit | Yes |
| T-086 | 11 — Security | `isSameOriginRequest()` with no `Origin`, a matching `Referer` | `true` | unit | Yes |
| T-087 | 11 — Security | `isSameOriginRequest()` with neither header | `false` (fail closed) | unit | Yes |
| T-088 | 11 — Security | `rateLimit()` unconfigured (no Upstash env vars), `NODE_ENV !== "production"` | `success: true` (fails open) | unit | Yes |
| T-089 | 11 — Security | `rateLimit()` unconfigured, `NODE_ENV === "production"` | `success: false` (fails closed) | unit | Yes |
| T-090 | Shared libs | `sanitizeArticleHtml()` on a string with a disallowed tag and a disallowed attribute | Disallowed tag/attribute removed, allow-listed markup kept | unit | Yes |
| T-091 | Shared libs | `sanitizeArticleHtml()` on a link | `rel` is rewritten to `noopener noreferrer nofollow` | unit | Yes |
| T-092 | Shared libs | `sanitizePlainText()` on a string containing a `<script>` | Both the tag and its inner content are removed | unit | Yes |
| T-093 | Shared libs | `calculateReadTimeMinutes()` on a short/empty body | Word count ÷ 200wpm, rounded, minimum `1` | unit | Yes |
| T-094 | Shared libs | `truncateAtWordBoundary()`/`deriveExcerpt()` on text longer than the limit | Cuts at the last space before the limit, never mid-word | unit | Yes |
| T-095 | Shared libs | `computeFingerprint()` with the same ip+UA twice vs. a changed ip or UA | Same input -> same hash; either input changing -> different hash | unit | Yes |
| T-096 | Shared libs | `checkForSpam()` on text containing a known keyword | `flagged: true`, `reason` names the matched keyword | unit | Yes |
| T-097 | E2E | Full admin flow: log in -> create article -> upload a real cover image -> publish -> see it live on the homepage and its own page -> Settings page's 3 cards render -> log out | Every step succeeds against a real running dev server; logging out actually clears the session (revisiting `/admin/dashboard` redirects back to login), the only real coverage `lib/auth-actions.ts`'s `logout()` Server Action gets (it needs a real `next/headers` request scope, same constraint as `getServerAuthSession` — see the auth-mocking note) | e2e | Yes |
| T-098 | E2E | Full public reader flow: browse homepage -> search inline -> open an article -> submit a comment -> like the article | Comment appears, like count increments, all against the real server | e2e | Yes |
| T-099 | E2E | **(priority)** `POST` directly to `/api/auth/callback/credentials` with valid credentials, then with invalid ones — never touching `/api/admin/login` | Valid credentials authenticate (session cookie set); invalid ones don't — proves the endpoint is reachable and enforces real credential checks independently of the pre-flight route | e2e | Yes — scope adjusted, see note 3 |

## Notes on "not automated" rows

**Note 1 (T-029).** The Module 1-7 audit itself already classified this one as "not
practically reproducible as a deterministic automated test," and that's still true: the
race is between a `setTimeout`-driven autosave firing and a `save()` call already in
flight, inside a `"use client"` component — reproducing it deterministically needs
component-level testing infrastructure (jsdom + fake timers + `@testing-library/react`)
that this module's brief scoped out (Vitest for routes/lib functions, Playwright for
real-browser flows — neither drives React state transitions in isolation). What *can*
be, and is, verified: the actual fix — clearing the dirty flag from the pre-request
snapshot, not after the request resolves (`components/admin/ArticleForm.tsx`'s `save()`)
— is a structural invariant checkable by reading the code, and the field continues to
autosave correctly across several sequential edits in the E2E admin flow (T-097), which
would surface any gross regression even without reproducing the exact original race.

**Note 2 (T-077).** `scripts/backfill-body-text.ts` is a one-time data migration with no
code path the running application ever calls again after it's been run once against a
deployment's existing data (already executed and verified live against seeded articles
in the Module 9 report). Writing a permanent regression test for a script that by design
runs at most once per deployment's history would mean maintaining test infrastructure
for code with no ongoing execution surface — if this script is ever reused (e.g. a new
migration following the same pattern), that new script should get its own test at that
time, not retroactively this one.

**Note 3 (T-099).** The original plan for this row was to reproduce the audit's exact
manual method — hammer the real endpoint 6 times against a live server and watch the
6th get a `429`. That's not honestly automatable against this repo's E2E server without
real Upstash credentials (none exist here — see `.env.local`, blank, same as
`DEVIATIONS.md` Module 1/7/11 already note): `next dev` runs with `NODE_ENV !==
"production"`, so `lib/rate-limit.ts`'s own documented behavior is to **fail open**
(allow every request) when Upstash isn't configured — the 6th attempt would go through
exactly like the first 5, not because rate limiting is broken, but because that's its
correct, deliberate behavior outside production. Running the E2E server in production
mode instead would flip that to **fail closed**, blocking the *first* login attempt too
— which would break T-096 (which needs to actually log in) and still wouldn't prove
"the 6th specifically is what fails." Faithfully faking Upstash's REST protocol for real
sliding-window semantics would mean re-implementing the Lua scripts
`@upstash/ratelimit` evaluates server-side (confirmed by reading its source — it calls
`redis.eval()`/`evalsha()` with real Lua, not simple key/value commands) — a large,
easy-to-get-subtly-wrong undertaking for a single test, and a wrong fake would be worse
than no test at all here. The numeric "6th attempt specifically" assertion is what T-009
already proves, deterministically and mocked, in CI; T-099 is scoped instead to what a
live server genuinely *can* prove without Upstash: that the endpoint NextAuth actually
serves enforces real credentials on its own, independent of the pre-flight route — still
real coverage, just not a re-run of the same numeric threshold a second way.

## Note on the auth mocking seam

Every integration test for a session-gated admin route (Module 2-5, 7's admin GET/PATCH)
mocks exactly one thing: `getServerAuthSession()` from `lib/auth.ts`, via
`vi.mock("@/lib/auth", ...)` with `importOriginal` preserving every other export
(`authOptions`, `requireAdminSession`) untouched. This is a framework-boundary seam, not
a shortcut around the route's own logic: `getServerSession()` (from `next-auth`) reads
cookies via `next/headers`, which only works inside a real Next.js request-handling
context (confirmed by reading `next-auth`'s own source — it calls
`require("next/headers")` directly) — invoking a route handler function directly from
Vitest, outside that context, has no such context to read from. Mocking the one function
that resolves "who is asking" lets every other line of the real route handler run
unmodified against the real in-memory database. The alternative — driving NextAuth's
actual CSRF-cookie handshake and session cookie end-to-end — is exactly what T-097's E2E
flow (a real browser, a real running server) already does, so the coverage isn't lost,
just split across the two test types by what each is actually suited for.

T-009 (rate limiting inside `authorize()`) and T-010 (the dummy-hash timing-consistency
fix) are the one place `authOptions` is used **unmocked** — the test reaches
`authOptions.providers[0].options.authorize` directly, which is the exact function
NextAuth's own credentials flow invokes, and calls it exactly the way NextAuth's core
does (`authorize(credentials, req)`), without going through NextAuth's HTTP routing at
all. T-099 (E2E) exercises the same rate limit through the real HTTP endpoint, so the
"real request path" case is still covered, just in the test type actually suited to
driving NextAuth's full HTTP + cookie handshake.
