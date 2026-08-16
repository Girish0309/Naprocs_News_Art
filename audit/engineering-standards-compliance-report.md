# Engineering Standards Compliance Report

**Date:** 2026-08-16
**Scope:** The two launch-blocking fixes built after `final-layout-and-ux-audit.md` —
mobile admin navigation, and DB timeout graceful degradation — checked retroactively
against `ENGINEERING_STANDARDS.md` (F1-F7, B1-B8). This is a one-time check, not a
re-audit of anything the two prior audits already covered.

---

## 1. What was fixed (recap)

### Mobile admin navigation
`components/admin/AdminShell.tsx` — the hamburger icon did nothing below `md`. Rebuilt
as a slide-in drawer: two-stage mount/open state (matches `SiteHeader`'s existing
collapsible-search pattern), closes via X button, backdrop click, Escape, or navigating.
`NavLinks`/`SupportAndLogout` extracted into shared sub-components so the drawer and the
desktop sidebar render identical JSX — active-state accent and spring easing can't drift
between them.

Verified live at 375px (9 checks): drawer mount/unmount state, correct open transform,
all 4 links present, active-accent class present, navigate-then-auto-close, backdrop
close, Escape close, X-button close, and a 1440px desktop-regression check — all passed.

### DB timeout graceful degradation
`lib/db.ts` — added `serverSelectionTimeoutMS: 5000` (was inheriting the driver's ~30s
default) and a `DatabaseConnectionError` class. New `lib/with-db-error-handling.ts`
wraps 9 Route Handlers to return a calm 503 instead of a raw crash (1 dead 501 stub
deliberately excluded). New `DbErrorFallback` components (public + admin themed) render
directly from Server Components — not via `error.tsx`, since Next.js redacts thrown
Server Component error messages in production. Applied to the homepage, the public
article page (including `generateStaticParams`, which runs on a separate, initially-
unprotected path), and the admin edit page. `DashboardContent` and `CommentsQueue` now
distinguish "failed to load" from "genuinely empty" instead of silently showing an
empty state during an outage.

Verified live against an unreachable `MONGODB_URI`, production build: homepage 5.9s,
a new article slug 5.85s, admin edit page (via saved session) 6.1s, `/api/search` 5.1s
— all showing the fallback instead of a 30s hang — then reverted and confirmed normal
operation resumed.

---

## 2. Retroactive compliance check — results

| Rule | Result | Notes |
|---|---|---|
| F1 — no raw hex/px outside config | **Gap** | See §3.1 |
| F2 — `flex-col` defaults to `items-stretch` | **Gap** | See §3.2 |
| F3 — focus state ships with every new control | Pass | Hamburger, X button, both "Try again" links all pair `focus:outline-none` with a visible ring |
| F4 — reuse the established timing curve | Pass | Drawer slide uses the existing spring curve; backdrop fade correctly uses plain ease (matches the rule's own state-change vs. visual-fade distinction) |
| F5 — adversarial content stress test | N/A | Neither fix renders new variable-length/user-supplied text |
| F6 — panel review before the third added field | N/A | No panel gained fields in this work |
| F7 — defined behavior at every breakpoint | Pass | This is the rule the mobile-nav fix itself resolves; confirmed via the 9 live checks above |
| B1 — atomic read-then-write | N/A | No read-then-conditionally-write sequence introduced |
| B2 — security control at the real entry point | N/A | No new security control introduced |
| B3 — explicit rate-limit decision per mutating endpoint | N/A | No new mutating endpoint added — only error-handling wrapped around existing ones |
| B4 — fail closed in production | Pass | `dbConnect` throws (fails closed) on an unreachable DB; no bypass path |
| B5 — re-sanitize at every render | N/A | No new HTML rendering introduced |
| B6 — explicit timeout on every external call | Pass | This is the rule the DB fix itself resolves |
| B7 — one write path per derived field | N/A | No new derived fields added |
| B8 — CSRF reasoning for new anonymous endpoints | N/A | No new anonymous endpoint added |

---

## 3. Gaps found (not yet fixed)

Both are pre-existing patterns carried into the new code, not new categories of
mistake, and neither is a functional bug — they're the letter of a rule not being
fully followed.

### 3.1 — F1: `bg-black/40` instead of a token
`components/admin/AdminShell.tsx:166` — the drawer backdrop uses Tailwind's built-in
`bg-black/40` rather than an `admin-*` design token. Not a new inconsistency —
`components/admin/CoverImageUploader.tsx:226` already does the same thing
(`bg-black/60`) — but the new drawer is now a second instance of the same untokenized
value.
**Suggested fix:** add an `admin-scrim` (and `journal-scrim`, for parity) token to
`tailwind.config.ts` and point both usages at it.

### 3.2 — F2: `items-center` without an inline reason
Three places use `flex-col items-center` with no comment justifying the deviation from
the rule's default (`items-stretch`):
- `components/public/DbErrorFallback.tsx:14`
- `components/admin/DbErrorFallback.tsx:13`
- `components/admin/DashboardContent.tsx:163` (the new `loadError` block)

Risk is low in practice — the two `DbErrorFallback` components already cap their text
with `max-w-md`/`max-w-sm`, and `DashboardContent`'s error text is a short, fixed,
developer-authored string, not user content that could realistically overflow. Still,
per F2's letter, each needs a one-line comment explaining why centering is correct here
(a centered empty/error-state message block, not a width-bound content container).
**Suggested fix:** add the inline comment to each of the three call sites — no layout
change needed.

---

## 4. Status — both gaps closed (2026-08-16)

### 3.1 fix
Added `scrim: "#000000"` to both `adminColors` and `journalColors` in
`tailwind.config.ts`. Repointed `AdminShell.tsx`'s drawer backdrop (`bg-black/40`) and
`CoverImageUploader.tsx`'s remove-image button (`bg-black/60`) to `bg-admin-scrim/50`
— one consistent opacity, replacing the 40/60 mismatch. `CoverImageUploader`'s
`hover:bg-black/80` state was deliberately left as a plain utility — it's an
interactive hover accent, not one of the two backdrop values the gap named, so
unifying it wasn't in scope here.

### 3.2 fix
Added the one-line comment to all three sites:
`// centered empty/error-state message, not a width-bound content container — F2 exception`
— `components/public/DbErrorFallback.tsx:14`, `components/admin/DbErrorFallback.tsx:13`,
`components/admin/DashboardContent.tsx:162` (as a `{/* */}` JSX comment there).

### Verification
- `tsc --noEmit`: clean.
- `eslint` on all 6 touched files: no new errors (see note below on one unrelated
  pre-existing finding).
- `vitest run`: 125/125 passing.
- Live Playwright check, real admin session, computed styles read directly from the
  browser (not assumed from the class name):
  - Drawer backdrop at 375px: `rgba(0, 0, 0, 0.5)` — was 0.4.
  - Cover-image remove button at 375px: base `rgba(0, 0, 0, 0.5)` (was 0.6), hover
    `rgba(0, 0, 0, 0.8)` (unchanged, as intended).
  - Same remove button re-checked at 1440px: base `rgba(0, 0, 0, 0.5)` — consistent
    across breakpoints.
  - 1440px desktop regression: sidebar visible, hamburger correctly hidden — no
    change from the token swap.
  - Screenshots at both viewports show the drawer and the remove-button legible
    against their backgrounds; nothing looks broken or newly hard-to-read at either
    opacity.
- Playwright E2E suite (`playwright.config.ts`) could not be run alongside this check
  — Next.js refuses to start a second dev server in the same project directory even on
  a different port, and the live dev server was already running. Stopping it to free
  the directory lock felt like a bigger interruption than this change warranted; `tsc`
  + `eslint` + `vitest` + the live computed-style/screenshot check above already cover
  what changed here (a Tailwind class swap in two components, plus comments). Happy to
  run the E2E suite too if you want that additional layer of confidence.

### Unrelated finding surfaced while linting the touched files
`eslint` reported a real (non-cosmetic) error already present in `AdminShell.tsx`,
unrelated to this fix:

```
components/admin/AdminShell.tsx:130
  error  Calling setState synchronously within an effect can trigger cascading
  renders  react-hooks/set-state-in-effect
```

This is in the `useEffect` that closes the drawer on route change (added by the
mobile-nav fix, not by this token/comment work) — `tsc`, `vitest`, and the Playwright
E2E suite all passed over it because none of those runs included `eslint`. It's out of
scope for this prompt (only F1/F2 from the compliance report), so I didn't touch it —
flagging it now rather than fixing it silently or leaving it unmentioned. Let me know
if you'd like it addressed.

---

## 5. Further gaps found (2026-08-16) — not yet fixed

Found while checking "any further gaps" beyond §3. Both are outside the scope of the
two recent fixes (mobile nav, DB timeout) — neither file was touched by either — but
are reported per this document's own purpose: don't let a known gap go undocumented.

### 5.1 — F1 process check: full-project ESLint sweep
Ran `eslint .` across the whole project, not just the files touched by §3, to confirm
nothing else was missed. Result: the only lint error anywhere in the project is the one
already named in §4's "Unrelated finding" — no additional hidden issues elsewhere.

### 5.2 — B6: Cloudinary and Upstash have no explicit timeout
B6's own rule text names these two services directly ("database driver, Cloudinary,
Upstash, any future integration"), and neither currently has a timeout set:

- `lib/rate-limit.ts:17` — `new Redis({ url, token })` (Upstash) has no timeout
  configured. Its REST calls use plain `fetch` with no `AbortController`/timeout, so a
  stalled connection could hang indefinitely — no bound at all, which is worse than the
  original MongoDB bug (that at least had the driver's ~30s default before the fix).
  `rateLimit()` runs synchronously inside the login/comment/reaction request paths
  (B2/B3), so a hang here would hang those endpoints with no fallback.
- `lib/cloudinary.ts:31` — `cloudinary.config(...)` has no `timeout` option set on the
  upload call.

**Not fixed** — picking deliberate timeout values for two different SDKs (and, for
Upstash, wiring an abort/timeout around its `fetch`-based client) is a real design
decision, not a mechanical one-line change, so it wasn't done without confirming first.

### 5.3 — Status — both closed (2026-08-16)

#### 1. `AdminShell.tsx:130` fix
Replaced the `useEffect(() => { setOpen(false); setMounted(false); }, [pathname])` that
tripped `react-hooks/set-state-in-effect` with react.dev's own documented "adjusting
state when a value changes during render" pattern instead — no new workaround style,
and no effect left calling setState directly in its body:

```tsx
const [prevPathname, setPrevPathname] = useState(pathname);
if (pathname !== prevPathname) {
  setPrevPathname(pathname);
  setOpen(false);
  setMounted(false);
}
```

Neither Module 7's ref-mutation technique nor Module 3/9's "never flip the flag back"
technique (the two specific fixes DEVIATIONS.md names for this same lint rule) applied
directly here — this needs to react to an externally-changing value (the route), not
sync into an uncontrolled DOM node or avoid a redundant reset — so this is the
react.dev-documented technique for that exact shape of problem, in the same spirit as
the project's established rule ("restructure so the effect body never needs a direct
setState call," not a suppress-comment). SiteHeader's own Escape-key effect (the
component AdminShell explicitly mirrors) was never in violation for a related reason:
its setState calls happen inside an async `keydown` listener callback, not synchronously
in the effect body itself, which is why that one was never flagged.

**Verified:** `eslint` — the error is gone (only the pre-existing, unrelated "unused
eslint-disable directive" warning on a different line remains). Live Playwright check
at 375px, real admin session: drawer still opens, a nav-link click still both navigates
and auto-closes it (tested against two different destinations), a direct URL/back-
forward-style navigation while open also closes it, and the drawer still opens normally
afterward — no regression from the refactor.

#### 2. `lib/rate-limit.ts` fix
Added `signal: () => AbortSignal.timeout(2500)` to the `Redis` client config — a
*function*, not a static `AbortSignal`, because a static one can only ever fire once
but this client is reused for the process's lifetime. Per the SDK's own request loop
(`node_modules/@upstash/redis`'s `HttpClient.request`), a function-based signal also
gets special handling on abort: it re-throws immediately instead of letting the
retry loop (up to 5 attempts by default) run again, so the whole call — retries
included — is bounded to one 2.5s window, not several stacked ones.

On a timeout specifically (detected via `error.name === "TimeoutError"`, the spec-
defined name `AbortSignal.timeout()` produces), both `rateLimit()` and
`peekRateLimit()` now route through the same environment-dependent decision already
used for "Upstash unconfigured" — fail open in development, fail closed in production
— via a shared `resultWhenNoEnforcementAvailable()` helper, rather than the
unconditional-fail-closed path used for other runtime failures (a genuine Upstash-side
error or non-timeout network failure, which stays rarer and more suspicious than "not
configured yet" or "timed out").

**Verified live**, all against real code paths (not the raw SDK in isolation):
- Blackholed URL + `NODE_ENV=production`: **2512ms** elapsed, `success: false` — fails
  closed, bounded to the 2.5s window.
- Same blackholed URL + `NODE_ENV=development`: **2512ms** elapsed, `success: true` —
  fails open, matching the unconfigured-Upstash behavior exactly as specified.
- Real Upstash instance, unchanged: `peekRateLimit` 766ms, `rateLimit` 371ms — both
  well under the timeout, confirming no regression to normal operation.

#### 3. `lib/cloudinary.ts` fix
Added `timeout: 15_000` to the upload call's options (a per-call option — the SDK's
own upload path reads `options.timeout` directly with no fallback to a global config
default, confirmed by reading `node_modules/cloudinary/lib/uploader.js`). The existing
`try/catch` in `app/api/admin/upload-image/route.ts` already returns the same calm
`"Upload failed. Please try again."` (502) for any Cloudinary error, so a timeout
surfaces as the same kind of clear error state already used for magic-byte rejection
and oversized files — no new error-handling code needed there.

**Verified live** against a real hang, not an external IP:
- First attempt used a blackholed public IP (`10.255.255.1`, the same address used
  for the DB-timeout work) — this turned out to be a **false-positive-prone test**: it
  failed at a fixed ~5s regardless of whether `timeout` was set to 8000 or 15000,
  meaning some OS/network-level rejection (not the configured option) was ending the
  request. Caught this by re-running with a different configured value and noticing
  the elapsed time didn't change.
- Replaced it with a local HTTPS server (throwaway self-signed cert) that accepts the
  connection but never responds — a genuine, controlled indefinite hang. Configured
  timeout of 3000ms → **3028ms** elapsed; 6000ms → **6005ms** elapsed. Elapsed time
  scales precisely with the configured value, proving `timeout` itself is what bounds
  the request (not a coincidental unrelated failure, as the first attempt would have
  wrongly suggested if left unquestioned).
- Real upload against the real Cloudinary account, with `timeout: 15_000` set: 1292ms,
  succeeded normally; cleanup (`destroy`) confirmed `ok` — no regression.

### Final regression, all three fixes together
`tsc --noEmit`: clean. `eslint .` (full project): zero errors — only the one
pre-existing, unrelated warning remains (see §4, not touched, still out of scope).
`vitest run`: 125/125 passing. All temporary verification scripts and the throwaway
TLS cert were deleted after use.

### Closing out the compliance report
Every item opened across §3 and §5 is now fixed and verified live:
- §3.1 (scrim token) — closed.
- §3.2 (`items-center` documentation) — closed.
- §4 / §5.3.1 (`AdminShell.tsx` ESLint error) — closed.
- §5.3.2 (`lib/rate-limit.ts` timeout) — closed.
- §5.3.3 (`lib/cloudinary.ts` timeout) — closed.

No new gaps were introduced by any of these fixes — confirmed via the full-project
`eslint .` sweep and the complete `vitest` suite after all changes, not just the files
touched.
