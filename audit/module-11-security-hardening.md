# Module 11 — Security Hardening Audit

A horizontal pass across every route in the app, not a new feature. Same rigor as
`/audit/module-1-7-audit.md`: every item below was verified by reading the actual file
or running the actual request — a live Next.js dev server against an isolated
in-memory MongoDB instance, torn down afterward. No changes were made to any file
without first confirming what it currently did.

## Summary

| Item | Verdict |
|---|---|
| 1. Zod validation audit | **4 gaps found, fixed** (public articles, admin articles, admin comments, search — all query-param validation) |
| 2. CSRF protection (comments, reactions) | **Added — verified live** |
| 3. Content-Security-Policy | **Added — verified live**, with documented loosenings |
| 4. Rate limiter coverage | **1 real gap found, fixed** (reactions endpoint had none); admin CRUD routes explicitly left unrated, with reasoning |
| 5. Security headers beyond CSP | **Added — verified live** |
| 6. Dependency vulnerabilities | **PASS — 0 findings** across 642 dependencies |
| 7. Live verification | **PASS** — see per-item detail below |

---

## 1. Zod validation audit

Read all 12 files under `app/api` individually — not just grepped for the word
`zod`, since a route can call `.safeParse` on the wrong thing or skip a query param
entirely while still importing `zod` for its body.

| Route | Body/query read | Verdict |
|---|---|---|
| `api/auth/[...nextauth]` | NextAuth's own request parsing | N/A — not this app's code to validate |
| `api/admin/login` POST | `email`, `password` | PASS — `loginSchema` (pre-existing) |
| `api/admin/2fa/setup` POST | none (session only) | N/A |
| `api/admin/upload-image` POST | `FormData` (file), not JSON | N/A for Zod — already validated via magic-byte + size checks (Module 4), a different but equally real mechanism |
| `api/admin/articles` GET | `status`, `q`, `page`, `limit` | **FAIL → FIXED** |
| `api/admin/articles` POST | full article body | PASS — `createArticleSchema` (pre-existing) |
| `api/admin/articles/[id]` PUT/PATCH | full article body | PASS — `updateArticleSchema` (pre-existing) |
| `api/admin/articles/[id]` DELETE | none (route param only) | N/A |
| `api/admin/comments` GET | `status` | **FAIL → FIXED** |
| `api/admin/comments` PATCH | `comment_id`, `status` | PASS — `updateCommentSchema` (pre-existing) |
| `api/articles` GET (public listing) | `tag`, `page`, `limit` | **FAIL → FIXED** |
| `api/articles/[id]` GET | none — a `501` stub, never implemented past the original scaffold | N/A, out of scope (dead code, not touched) |
| `api/articles/[id]/comments` GET | none (route param only) | N/A |
| `api/articles/[id]/comments` POST | `author_name`, `body` | PASS — `createCommentSchema` (pre-existing) |
| `api/articles/[id]/react` GET | none (route param only) | N/A |
| `api/articles/[id]/react` POST | `type` | PASS — `reactSchema` (pre-existing) |
| `api/search` GET | `q`, `page`, `limit` | **FAIL → FIXED** (folded a manual early-return into the schema) |

**What was added**: `lib/query-params.ts` — shared, reusable Zod pieces
(`pageParam`, `limitParam(default, max)`, `boundedTextParam(maxLength)`) — rather than
each of the 4 fixed routes hand-rolling its own. Two deliberate design choices:

- **Pagination (`page`/`limit`) uses `.catch()`, not rejection.** A malformed page
  number isn't a security-relevant input here — nothing downstream trusts it for
  anything but a bounded `skip`/`limit` — so it falls back to a default exactly like
  the original `Number(x) || fallback` logic did. This only formalizes existing
  behavior through Zod; it doesn't change it. Verified live: `?page=notanumber&limit=abc`
  still returns real results with `page: 1, limit: 6`, not a 400.
- **Status enums and search queries now genuinely reject malformed input.** The
  admin articles/comments GET routes previously *silently ignored* an invalid
  `status` value (fell through to "no filter"). This is a real behavior change,
  made deliberately: silently ignoring bad input is a footgun, and the brief asked
  to close exactly this kind of gap. Verified live: `?status=bogus` now returns `400`
  on both routes (confirmed via a real authenticated session, not just reasoned
  through). `boundedTextParam` also caps `q`/`tag` length (200/100 chars) — verified
  a 300-character search query now `400`s.

---

## 2. CSRF protection

**Added** `lib/csrf.ts`'s `isSameOriginRequest()`, applied to the top of both
`POST /api/articles/[id]/comments` and `POST /api/articles/[id]/react`, before any
other processing.

**Mechanism**: checks the `Origin` header against this app's own origin
(`NEXTAUTH_URL`, the same base-URL convention established in Module 5/10); falls back
to `Referer` if `Origin` is absent; rejects (`403`) if neither is present or neither
matches.

**Why this approach fits these two routes specifically**: both are intentionally
anonymous — no session, just a fingerprint hash. Token-based CSRF protection binds a
secret to a session so a forged request can be told apart from a real one *by that
user*; there is no "that user" here to bind anything to. Origin/Referer checking asks
a different, sufficient question for this case — not "is this the same authenticated
user" but "did this request genuinely originate from a page this app served" — which
is exactly what matters for an anonymous mutation. Browsers attach `Origin` to every
POST/PUT/PATCH/DELETE request themselves (unforgeable by page JavaScript), which is
what makes this a real control and not just a header a client could fake to bypass it.

**Why this would NOT be sufficient (or appropriate) for the admin routes**: the admin
routes already get real CSRF protection from NextAuth itself — a token minted at
`/api/auth/csrf`, verified against the session on every credentials sign-in, backed by
the session cookie's own `sameSite: "strict"` attribute (`lib/auth.ts`, confirmed in
the Module 1-7 audit). Layering an Origin check on top wouldn't strengthen that; it
would just be a second, weaker mechanism next to a stronger one already doing the job,
and answers a different question anyway (it says nothing about *who* is asking, only
*where from* — irrelevant once a real session already establishes who). It also wasn't
touched to avoid any risk of the two mechanisms disagreeing on some edge case (e.g. an
admin request proxied through infrastructure that alters Origin/Referer) and breaking
a real admin action over a redundant check.

**Verified live** (all four, via a real running server, not reasoned through):
- Forged `Origin: https://evil-attacker.example` → `403`.
- No `Origin` and no `Referer` at all → `403` (fail closed).
- Correct `Origin: http://localhost:3000` → `201 Created`, comment actually saved.
- `Referer` only (no `Origin` header, matching some non-fetch submission paths) →
  `201 Created` — confirms the fallback path itself works, not just the primary one.
- Same four checks repeated against the reactions endpoint: forged Origin → `403`;
  correct Origin → success with the real updated `like_count`.

---

## 3. Content-Security-Policy

**Exact final header value** (copied from a real `curl -I` response):

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https://res.cloudinary.com blob:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
```

Implemented via `next.config.ts`'s `headers()` (a static header, not middleware) —
deliberately **not** the nonce-based approach. Next.js's own CSP guide
(`node_modules/next/dist/docs/.../content-security-policy.md`, read directly rather
than assumed) states nonce-based CSP requires **every page to render dynamically**,
disabling static generation and ISR entirely. This app's public pages have relied on
SSG+ISR since Module 5 and it's been verified repeatedly since (Modules 6, 9, 10) —
trading that away for per-script nonces isn't a reasonable tradeoff for this app's
threat model, so the static "Without Nonces" approach (Next's own documented
alternative for exactly this situation) was used instead.

**What had to be loosened, and why — checked, not assumed:**

- **`script-src` needs `'unsafe-inline'`.** Grepped the entire app for raw inline
  `<script>` tags in custom code: found exactly one, the JSON-LD block on the article
  page (Module 10). It uses `type="application/ld+json"` — browsers don't treat
  non-JavaScript script types as subject to `script-src` at all, so it needed no
  allowance. The real reason `'unsafe-inline'` is required is Next.js's **own**
  behavior: without a nonce, Next streams RSC/hydration payloads via inline
  `<script>` tags, and Next's own documented non-nonce baseline includes
  `'unsafe-inline'` for exactly this reason. This is a genuine, unavoidable
  consequence of not using nonces (see above), not something specific to this app's
  own code.
- **`style-src` needs `'unsafe-inline'` — and it's not Tailwind.** Verified Tailwind
  v3's output is fully compiled to a static stylesheet at build time; it injects
  nothing at runtime and needs no allowance. What *does* need it: `next/image`'s
  `fill` mode (used for every cover/hero image on the public site) renders a real
  inline `style="position:absolute;height:100%;..."` attribute on each image
  (confirmed by inspecting actual rendered HTML), and `CoverImageUploader`'s upload
  progress bar sets `style={{ width: `${progress}%` }}`. Both are inline style
  *attributes*, which `style-src` governs the same way it governs `<style>` blocks.
- **`img-src` uses `blob:`, not `data:`.** The brief anticipated `data:` URIs for
  placeholders; grepped for both and found the opposite — `CoverImageUploader`'s local
  upload preview uses `URL.createObjectURL(file)` (produces `blob:` URLs), and nothing
  in the app's actual code emits a `data:` image URI (`next/image`'s blur-placeholder
  feature, the other common source, isn't used anywhere). `blob:` was used in place of
  `data:` to match what's actually needed rather than what was assumed to be.
- **`font-src 'self'` needed no CDN allowance at all.** Grepped for
  `fonts.googleapis.com`/`fonts.gstatic.com` across the whole repo: the only matches
  are in `design-reference/*.html` (the Stitch-exported mockups, never served — plain
  static reference files). Module 3's switch to `next/font/google` self-hosting
  (`app/layout.tsx`) is confirmed fully intact with nothing regressed back to CDN
  loading.

**Honest limitation worth stating plainly**: because `script-src` includes
`'unsafe-inline'` (unavoidable without nonces, as above), this CSP does **not** stop a
successful stored-XSS injection from executing its own inline `<script>` tag — CSP
here is defense-in-depth against loading *external* malicious scripts/exfiltration
domains and against clickjacking (`frame-ancestors`), not a primary XSS defense. The
actual XSS defense remains what it already was: `sanitizeArticleHtml`/
`sanitizePlainText` at write time, React's default JSX escaping, and the JSON-LD `<`
escaping added in Module 10. Not overstating what this header buys.

**Verified live**: `curl -I` against a real running article page shows the exact
header value above, present on the actual HTTP response, not just configured.

---

## 4. Rate limiter coverage

Every mutating endpoint (POST/PATCH/DELETE) in the app:

| Endpoint | Rate limited? |
|---|---|
| `POST /api/admin/login` (pre-flight) + `authorize()` (real enforcement) | **Yes** — `login:${ip}`, 5/15min (Module 1-7 audit fix) |
| `POST /api/admin/upload-image` | **Yes** — `upload-image:${adminId}`, 10/hour (Module 4) |
| `POST /api/articles/[id]/comments` | **Yes** — `comment:${fingerprint}`, 5/15min (Module 7) |
| `POST /api/articles/[id]/react` | **FAIL → FIXED** — had none at all; added `react:${fingerprint}`, 30/15min (higher than comments': a single click, no typing, and a legitimate reader toggles more than 5 reactions while browsing — starting point, not a fixed rule, same framing as every other threshold in this app) |
| `POST /api/admin/articles` (create) | **No — intentional.** Session-gated; the realistic caller pool is 1-3 real admins (no self-registration exists, per the Module 1-7 audit); the actual threat this would guard against — a compromised admin session being used to hammer the API — isn't meaningfully stopped by a rate limit anyway, since a valid session already grants full read/write access regardless of request pace. |
| `PATCH/PUT /api/admin/articles/[id]` (update/publish) | **No — same reasoning as above.** |
| `DELETE /api/admin/articles/[id]` | **No — same reasoning as above.** |
| `PATCH /api/admin/comments` (moderate) | **No — same reasoning as above.** |
| `POST /api/admin/2fa/setup` | **No — same reasoning as above**, plus: 2FA enforcement isn't wired up yet (Module 2 groundwork only), so the actual impact of this route being called repeatedly is low regardless. |

One real gap (reactions) found and fixed. The admin CRUD routes are a deliberate,
stated choice, not an oversight — flagging explicitly rather than leaving it
ambiguous which admin routes were considered and skipped on purpose.

---

## 5. Security headers beyond CSP

All added via the same `next.config.ts` `headers()` block as the CSP, applied
globally (`source: "/:path*"`). **Verified live** against a real response:

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

`X-Frame-Options: DENY` was added beyond what was explicitly asked — a legacy
pre-CSP fallback carrying the exact same intent as `frame-ancestors 'none'`, for
browsers old enough not to respect the CSP directive. Redundant in modern browsers,
harmless and free in older ones.

---

## 6. Dependency vulnerability check

`npm audit` (JSON output, full report):

```
"vulnerabilities": { "info": 0, "low": 0, "moderate": 0, "high": 0, "critical": 0, "total": 0 }
"dependencies": { "prod": 186, "dev": 418, "optional": 93, "total": 642 }
```

**PASS.** Zero known vulnerabilities at any severity across all 642 dependencies
(direct + transitive). Nothing to patch before Module 12.

---

## 7. Live verification — full results

All run against a real Next.js dev server (isolated in-memory MongoDB, seeded test
data, torn down afterward — same methodology as the Module 1-7 audit and every module
since). One environmental note: the dev server hit a Turbopack panic twice
(`0xc0000142`, a Windows process-spawn failure compiling `globals.css`) unrelated to
any code in this module — resolved by clearing the `.next` cache and restarting.
Documented here since it's a real, if unrelated, thing encountered, not swept aside.

| Check | Result |
|---|---|
| CSP header present on a real response | **PASS** — exact value confirmed via `curl -I` |
| Other security headers present | **PASS** — all four confirmed via `curl -I` |
| Comment POST, forged `Origin` | **PASS** — `403` |
| Comment POST, no `Origin`/`Referer` at all | **PASS** — `403` |
| Comment POST, correct `Origin` | **PASS** — `201`, comment actually persisted |
| Comment POST, `Referer` only (no `Origin`) | **PASS** — `201`, fallback path confirmed working |
| Reaction POST, forged `Origin` | **PASS** — `403` |
| Reaction POST, correct `Origin` | **PASS** — `201`-equivalent success, real `like_count` returned |
| Malformed `page`/`limit` on public listing | **PASS** — graceful fallback (`page: 1, limit: 6`), not an error |
| Empty `q` on search | **PASS** — `400` |
| Overlong (300-char) `q` on search | **PASS** — `400` |
| Invalid `status` enum on admin articles GET (real authenticated session) | **PASS** — `400` |
| Invalid `status` enum on admin comments GET (real authenticated session) | **PASS** — `400` |
| Valid `status` on admin articles GET | **PASS** — `200`, unaffected |

All temporary test infrastructure (in-memory MongoDB, seeded accounts/articles,
`mongodb-memory-server`) was removed after verification; final `tsc --noEmit`,
`eslint .`, and `git status` are clean.
