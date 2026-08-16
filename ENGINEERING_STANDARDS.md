# Naprocs Newsletter Platform — Engineering Standards

This document exists because the Module 1-14 audits found the same handful of mistake
*patterns* recurring across otherwise-unrelated features. Each rule below traces back to
a real bug this project actually shipped and then caught — not a hypothetical. The goal
isn't more process for its own sake; it's making sure the next feature doesn't reintroduce
a mistake this project already paid to find once.

---

## FRONTEND RULES

### F1 — No raw hex/px values outside `tailwind.config.ts`
**Why:** Module 12's audit found `.floating-label-input:focus` using a hardcoded
`#0b0b0c` that had silently drifted from the real `admin.primary` token (`#000000`) —
a focused input was a subtly wrong shade of black compared to every other focused
element on the same screen, and nobody noticed until a dedicated grep for raw hex
values caught it.
**Rule:** Every color, spacing, and font-size value must reference a design token.
Before merging any new component, grep the diff for raw `#`, unbracketed `px` values,
and hardcoded font-family strings outside the config file. If a new value is genuinely
needed, it goes into `tailwind.config.ts` first, then gets referenced — never inlined
ad hoc "just this once."

### F2 — `flex-col` containers must use `items-stretch`, never `items-start`/`items-center`, unless a specific reason is documented inline
**Why:** Two separate, real overflow bugs (Module 15 final audit, findings A.1 and A.2)
came from the identical root cause: a `flex-col` container with non-stretch alignment
shrink-wraps to its content's natural width instead of the parent's width. A long
unbroken string then overflowed both sides, and `break-words`/`min-w-0` had zero effect
because the box was never width-constrained in the first place — the bug was one
alignment keyword, twice, in two different components nobody thought to check.
**Rule:** Default to `items-stretch` on every `flex-col` container. If `items-start` or
`items-center` is genuinely needed (e.g. a deliberately content-sized badge), leave an
inline comment explaining why, so a future audit doesn't have to rediscover the same
root cause a third time.

### F3 — Every new interactive element ships with a visible focus state on the same PR, not as an accessibility pass later
**Why:** Module 12 had to retroactively add focus rings across the entire admin console
because they'd been skipped consistently — not because focus states are hard, but
because nobody was checking at the point of building each control.
**Rule:** `focus:outline-none` is never paired with nothing — it must always be paired
with an explicit `focus:ring-2 focus:ring-*` (or equivalent) in the same commit that
adds the control. Every icon-only button needs `aria-label` at creation time, not
retrofitted.

### F4 — Every new animation/transition reuses an existing timing curve; a new curve requires a documented reason
**Why:** `.fade-transition` used generic `ease-in-out` while every other interactive
element in the app used the same established spring curve
(`cubic-bezier(0.175, 0.885, 0.32, 1.1)`) — a one-off inconsistency that sat unnoticed
for multiple modules because nothing forced a side-by-side comparison until the final
audit did one.
**Rule:** Before writing a new `transition`/animation, grep `admin.css`/`globals.css`
for the existing easing values first. State-change confirmations (save, publish,
approve/remove) use the spring curve; purely visual transitions (hover, fade) use
simple ease. A new, different curve needs an inline comment saying why the existing
ones don't fit.

### F5 — Any component rendering user-supplied or variable-length text gets stress-tested with adversarial content before being considered done
**Why:** Every real overflow bug found in the final audit only showed up under content
nobody had actually tried yet — a 150-character unbroken title, a 2000-character
comment, 15+ tags. The design looked correct against realistic sample content the whole
time.
**Rule:** Any new component that renders admin- or user-authored text must be checked
against: an extremely long single unbroken word, the field's actual max length (if one
exists) at that max, and zero/empty content — at minimum 320px, 768px, and 1440px —
before it's considered complete, not after a dedicated audit finds it later.

### F6 — Every dashboard/list screen accumulating fields across features gets a fresh whole-panel review before the third field is added, not after the tenth
**Why:** The editor sidebar grew fields across Modules 3, 4, and 10 without anyone
stepping back to look at the panel as a whole until the final polish pass — which,
this time, found it was actually fine, but only because someone finally checked
spacing tokens directly rather than assuming accumulated fields had made it cramped.
**Rule:** Any panel/sidebar that gains a field from a new feature gets its overall
grouping and spacing sanity-checked in that same PR — a 30-second look, not a
deferred "we'll polish it later" that turns into three modules of unreviewed growth.

### F7 — No control ships without a defined behavior at every breakpoint the app supports, including "doesn't exist yet"
**Why:** The admin mobile hamburger menu shipped visually (an icon existed) with zero
behavior behind it, for multiple modules, because "add mobile nav" was never anyone's
explicit task — it was assumed to be someone else's job or already done.
**Rule:** Any new navigational element must work at every width the app claims to
support (see F5's breakpoints) at the time it's built. If a control is being added at
desktop width only and mobile support is deliberately deferred, that must be stated in
a code comment and in the deviations log — not left silently absent for an audit to
discover as if it were a bug rather than a known gap.

---

## BACKEND RULES

### B1 — Any read-then-conditionally-write operation must be a single atomic database command, not two round trips
**Why:** The comment moderation double-decrement bug (Module 7/1-7 audit) and the
reaction race conditions (Module 8) both came from the same shape of mistake: read a
document, decide what to do based on what was read, then write — with a real
concurrency window between the read and the write where a second request could act on
the same stale state.
**Rule:** Any operation of the form "check current state, then update based on it" must
use `findOneAndUpdate` with the checked state in the filter (compare-and-swap), or an
equivalent single atomic operation — never a separate `find()` followed by a
conditional `save()`/`update()`. If a scenario genuinely can't be expressed as one
atomic command (Module 8's conditional-delete-then-upsert is the documented exception),
the two-step sequence and why it's still safe must be written down inline.

### B2 — Every rate limiter, security check, or validation gate must be enforced at the actual entry point the attack would use, not just the UI's happy path
**Why:** The single most serious bug this project shipped was the login rate limiter
existing and looking correct — it just lived in a separate pre-flight endpoint the
browser UI happened to call, while the real NextAuth credential-check endpoint had zero
enforcement. Anyone attacking the login directly, which is exactly how a real attack
would work, hit no rate limiting at all.
**Rule:** For every security control, explicitly identify and test the *most direct*
path an attacker (not a browser) would take to the protected action, and confirm the
control fires there — not just on whatever endpoint the UI happens to call first. A
control that only the UI's specific call sequence exercises is not a real control.

### B3 — Every new mutating endpoint gets an explicit rate-limit decision — "yes, with these numbers" or "no, because X" — never a silent default
**Why:** Module 11's hardening pass found the reactions endpoint had shipped with zero
rate limiting, unlike comments which had one from the start — not a deliberate
decision, just an oversight from building similar features at different times.
**Rule:** No POST/PATCH/DELETE route merges without an explicit rate-limit call or an
explicit inline comment stating why it doesn't need one (e.g. "admin-only, session-
gated, low realistic call volume"). Silence is not an acceptable state for this
decision.

### B4 — All rate limiting and other security-critical utilities must fail closed in production when their backing service is unreachable or unconfigured, and fail open only in local development
**Why:** The original rate-limit utility failed open (allowed all requests)
unconditionally whenever Upstash wasn't configured — including in production, meaning a
misconfigured deploy would silently run with zero protection and only a console warning
nobody watches.
**Rule:** Any utility whose entire purpose is enforcing a security boundary must check
`NODE_ENV` and fail closed (block/deny) in production if its backing service is
unreachable or unconfigured, logging loudly (`console.error`, not `warn`) when this
happens. Dev-mode fail-open is fine and expected, for local convenience — production
fail-open is never acceptable, even temporarily, even "just until credentials are set
up."

### B5 — Every field that will ever be sanitized once must be re-sanitized at every point it's rendered or re-consumed, not trusted from its original save
**Why:** The project's own defense-in-depth articles (`sanitizeArticleHtml` at both
save time and render time) got this right by design — but it only happened because the
brief explicitly called for it. Comment bodies were similarly double-protected
(sanitization + React's own JSX escaping). This pattern is correct and should be the
default assumption, not something re-derived per feature.
**Rule:** User- or admin-supplied content that's stored as HTML or gets rendered via
`dangerouslySetInnerHTML` must be sanitized at write time AND immediately before
render, independently — never trusted just because "it was already cleaned once."

### B6 — Every external network call in a request path (database, third-party API) must have an explicit, deliberately-short timeout — never the library default
**Why:** `lib/db.ts` inherited MongoDB's default ~30-second `serverSelectionTimeoutMS`
with no override, meaning a brief, ordinary Atlas connectivity blip turned every single
page on the site — not just error cases — into a 30-second hang followed by a raw 500.
This was found by accident during an unrelated audit, not by design.
**Rule:** Every external service client (database driver, Cloudinary, Upstash, any
future integration) must have its timeout explicitly and deliberately set — short
enough that a real outage fails fast with a graceful fallback, not the library's
often-generous default. Pair every such timeout with an actual fallback UI state, not
just a faster crash.

### B7 — Every timestamp, count, and status field must have exactly one write path, documented, with every other write path treated as a bug
**Why:** This project got this right from the start (server-generated timestamps only,
`$inc` for counts, single-source status enums) specifically because it was called out
explicitly in early module briefs — worth keeping as an explicit rule rather than
letting it be assumed knowledge that erodes as more people/sessions touch the code.
**Rule:** Any field that tracks state derived from events (a count, a status, a
timestamp) must have its write path traceable to exactly one function/route per type of
transition. If a second write path for the same field appears anywhere, that's a defect
to investigate, not a coincidence to ignore.

### B8 — Any new feature involving anonymous (non-session) write access must have its own CSRF consideration, not inherit the session-based app's protection by assumption
**Why:** Module 11 specifically had to reason through why comments/reactions (anonymous,
fingerprint-based) needed a different CSRF approach (Origin-header checking) than the
session-based admin routes (which get NextAuth's built-in protection for free) — these
are genuinely different threat models that are easy to conflate.
**Rule:** Any new anonymous, non-session-based mutating endpoint must have its CSRF
protection explicitly reasoned through and documented — never assumed to be "covered"
by whatever protects the authenticated routes, since it isn't the same mechanism.

### B9 — Never assume a library's documented refresh/update mechanism actually fires in this app's specific call pattern — trace the real call sites first
**Why:** Implementing the 15-minute idle-session timeout (post-launch), it would have
been easy to just set `session.updateAge` and assume NextAuth's built-in JWT-session
refresh handled the rest, the way its own docs describe. Reading the actual installed
source (`node_modules/next-auth/core/routes/session.js`) showed `updateAge` is *only*
consulted in the database-adapter branch — the JWT branch this app uses ignores it
entirely, and even its own unconditional-refresh path only runs from the
`/api/auth/session` route, which nothing in this app (no `SessionProvider`/
`useSession()` anywhere, and `getServerAuthSession()` always calls `getServerSession()`
with 0 args, which no-ops cookie writes) ever calls. The session cookie was never being
refreshed at all, by anything, under any config — a config-only fix would have shipped
silently broken.
**Rule:** When a feature depends on a library "refreshing," "syncing," or "re-issuing"
something automatically, trace the actual code path this app's specific usage pattern
takes through that library's source before relying on it — a documented mechanism that
exists in the library is not the same as one that's reachable from how this app calls it.

---

## PROCESS RULES

### P1 — Every module/feature ends with an explicit "what's still a TODO/stub, and why" statement, not silence
**Why:** This project's deviations log is genuinely one of its strongest assets — every
deliberate simplification, deferred feature, or known gap is written down with its
reasoning, which is exactly why 14 modules of incremental work didn't quietly
accumulate untracked technical debt.
**Rule:** Keep doing this. Every feature that stubs something out, defers something, or
makes a judgment call between two valid approaches gets one sentence in a deviations
log — not because process demands it, but because this specific practice is what made
every later audit in this project actually tractable.

### P2 — A horizontal audit (across all features, not one feature at a time) happens at natural milestones, not only at the very end
**Why:** The Module 7 mid-build audit and the final pre-launch audit both caught real,
serious bugs specifically *because* they looked across features together rather than
one at a time — the login rate-limit bypass, the mobile nav gap, and the DB timeout
issue were all things no single module's own review would have surfaced.
**Rule:** Don't wait until "done" to look at the whole system together. A horizontal
pass — consistency, security surface, cross-feature interactions — belongs at roughly
the halfway point of any major addition, not only at the end.

### P3 — A finding is not "fixed" until it's been re-verified at the same scope the original bug was found in, not just the specific spot it was noticed
**Why:** Two separate mobile overflow bugs in the final audit were explicitly re-tested
across all 7 required widths after each fix, specifically because Module 12's own
history showed a narrow fix at one width causing a regression at another.
**Rule:** After fixing anything found via a matrix-style check (multiple widths,
multiple browsers, multiple content variations), rerun the entire matrix — not just the
one cell where the bug was originally caught.

---

## How to use this document

Before starting any new feature or module, skim the rules above relevant to what's
being built. Before considering any feature complete, check it against F1-F7 (if it
touches UI) and B1-B8 (if it touches data/security). This isn't meant to slow work
down — every rule here exists because skipping the equivalent check once already cost
real debugging time on this exact project.
