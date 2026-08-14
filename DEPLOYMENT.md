# Deployment Guide

This is a handoff document for whoever actually clicks the buttons on Vercel
(or wherever this ends up hosted) — it assumes no prior context beyond "I have
access to the MongoDB Atlas project, and I'm about to create a hosting
account." Written at the end of Module 14, after the app itself was already
built, audited, hardened, styled, and tested (Modules 1-13; see
`DEVIATIONS.md`).

**Status as of writing this**: the code is pushed to GitHub
(`https://github.com/Girish0309/Naprocs_news`, branch `master`, single branch,
no `main`/`master` ambiguity) but not yet deployed anywhere. Everything below
is either done, or is a precise checklist for the parts that need direct
access to accounts (MongoDB Atlas, a hosting provider) that weren't available
while writing this. See "What's actually done" at the bottom.

---

## 1. Is this app portable, or Vercel-specific?

Fully portable. Confirmed by grepping the whole codebase:
- No `@vercel/*` package, no `vercel.json`, no `VERCEL_*` env var read anywhere.
- No route anywhere sets `export const runtime = "edge"` — every route and
  the `proxy.ts` middleware run on the plain Node.js runtime.
- All external state lives in three third-party services reached purely via
  env vars: MongoDB Atlas, Cloudinary, Upstash Redis. Nothing is tied to a
  specific host's proprietary storage/KV/queue product.

So: **Vercel is the natural fit** (zero-config for Next.js, and what the
brief assumes), but this would also run unmodified on Railway, Render,
Fly.io, or a plain VPS with `next build && next start` and the same env vars.
The instructions below are written for Vercel specifically since that's the
likely target, with a note wherever something is Vercel-only.

## 2. Environment variables

Nine keys, same names everywhere this runs. **Never commit any of these** —
`.gitignore` already excludes `.env*` (except `.env.local.example`, which has
blank placeholders only).

| Key | Where it's read | Production value |
|---|---|---|
| `MONGODB_URI` | `lib/db.ts` | The **new scoped-user** connection string — see §3.2, not the existing admin one |
| `NEXTAUTH_SECRET` | `lib/auth.ts` (NextAuth) | A freshly generated value — see §3.3, never the dev one |
| `NEXTAUTH_URL` | `lib/auth.ts`, and (doubling as the site's public base URL) `lib/site-config.ts` | The real deployed domain, e.g. `https://<project>.vercel.app` |
| `CLOUDINARY_CLOUD_NAME` | `lib/cloudinary.ts`, `next.config.ts` (image remote pattern) | Same as local — see the note below |
| `CLOUDINARY_API_KEY` | `lib/cloudinary.ts` | Same as local |
| `CLOUDINARY_API_SECRET` | `lib/cloudinary.ts` | Same as local |
| `UPSTASH_REDIS_REST_URL` | `lib/rate-limit.ts` | Same as local |
| `UPSTASH_REDIS_REST_TOKEN` | `lib/rate-limit.ts` | Same as local |

**`NEXT_PUBLIC_SITE_URL` — do not set this.** The brief that prompted this
deployment listed it alongside `NEXTAUTH_URL`, but it's not read anywhere in
this codebase (confirmed by grep) — `lib/site-config.ts`'s `SITE_URL` (used by
`sitemap.ts`, `robots.ts`, JSON-LD, canonical/OG tags — everywhere the public
domain matters) reads `NEXTAUTH_URL` only, a decision made explicitly back in
Module 10 to avoid two URL env vars that could drift out of sync. Setting
`NEXT_PUBLIC_SITE_URL` would just be an inert, unused variable. If a real
future need for a `NEXT_PUBLIC_`-prefixed client-side URL comes up, add it
deliberately then — don't add it speculatively now.

**On reusing local Cloudinary/Upstash credentials for production**: reasonable
for a project this size — a personal/small-team newsletter, not a
multi-tenant SaaS product. The blast radius of one shared Cloudinary account
is "cover images," and Upstash's cost model is usage-based either way. Revisit
this if the project grows a genuine security boundary between environments
(e.g. a staging environment that shouldn't share production's image library),
which doesn't exist yet — see §7's "known limitations."

**Build-time note**: `app/(public)/articles/[slug]/page.tsx`'s
`generateStaticParams()` queries MongoDB *during the build* (to know which
article slugs to pre-render). This means `MONGODB_URI` must be set as a
**build-time** env var, not only a runtime one — on Vercel, variables set in
Project Settings → Environment Variables are available at both build and
runtime by default, so this is automatic; just don't scope it to "Production
only... runtime only" if the hosting UI ever offers that distinction.
Confirmed this actually works: ran a real `next build` locally against a
temporary database and it completed cleanly, generating the `/articles/[slug]`
route as SSG as expected (see §8 for the full local verification that was run
in place of an actual deployment).

## 3. Pre-deploy security cleanup

### 3.1 MongoDB Atlas Network Access — keep 0.0.0.0/0, this is correct

The existing "Allow Access from Anywhere" rule is **the right call for this
setup**, not an oversight to fix — confirmed rather than assumed:

- Standard Vercel deployments (Hobby/Pro, no add-ons) have no fixed outbound
  IP — serverless functions run from a shared, rotating IP pool. There is no
  finite IP list to allowlist; attempting to enumerate one will silently
  break the app the next time Vercel's infra shifts.
- The actual security boundary here is (a) a strong, unique database
  password, and (b) TLS, which `mongodb+srv://` connection strings enforce
  by default already (SRV-record connection strings imply `tls=true`) — both
  already true.
- (c), which this module adds: a **least-privilege database user** (§3.2), so
  that even in a worst case (a leaked connection string), the blast radius is
  "read/write on one application database," not "full Atlas admin."

**Future upgrade path, not a blocker**: if this project ever moves off
Atlas's free M0 tier onto a dedicated cluster (M10+), Atlas offers
**Network Peering** and **PrivateLink**, and Vercel separately offers
**Secure Compute** (a paid add-on that gives deployments static outbound
IPs) on its Pro/Enterprise plans. Combining those would let you drop
0.0.0.0/0 entirely. Not worth the cost or complexity at this project's
current scale — noted here so it's a deliberate later decision, not a
forgotten one.

### 3.2 Create a scoped database user (do this in Atlas before deploying)

The existing `girish_db_user` has `atlasAdmin@admin` — full Atlas admin
across every database in the project. That's broader than the app needs and
was flagged as a dev-time shortcut back when it was first set up. Steps:

1. Atlas dashboard → **Database Access** → **Add New Database User**.
2. Authentication Method: **Password**. Username: something distinct from
   the admin user, e.g. `naprocs_app`.
3. Password: use Atlas's **Autogenerate Secure Password** button, or a long
   random one of your own — **do not reuse** `girish_db_user`'s password.
4. Database User Privileges: choose **Specific Privileges** (not a built-in
   role like `atlasAdmin` or `readWriteAnyDatabase`) → add role **`readWrite`**
   scoped to database **`naprocs-newsletter`** specifically (leave the
   collection field blank to cover every collection in that one database).
5. Save.
6. Database → **Connect** → **Drivers** → copy the connection string
   template, substitute the new username/password, and make sure the
   database name is explicit in the path:
   `mongodb+srv://naprocs_app:<password>@<cluster>.mongodb.net/naprocs-newsletter?retryWrites=true&w=majority`
7. **This new string is the production `MONGODB_URI`** (§2). Keep
   `girish_db_user` around for manual Atlas dashboard access only — never
   put its credentials in an app's env vars again.

### 3.3 Rotate NEXTAUTH_SECRET

The dev value has been visible in plaintext throughout this build (chat
history, terminal scrollback) — generate a fresh one for production and never
reuse it anywhere else:

```
openssl rand -base64 32
```

(Or, since a fresh value was already generated while writing this and never
printed in this conversation for the same reason: it's sitting in
`new-nextauth-secret.txt` in this session's scratchpad directory — copy it
from there into the hosting provider's env var UI directly, then delete that
file. Either way, generate it once, paste it once, and don't let it live
anywhere else in plaintext — including, ideally, not in this chat again.)

### 3.4 Rotate the initial admin password

`tejesh@naprocs.in`'s password was set during Module 2's setup and has been
visible in plaintext the same way. **Do this after deploying, using the app
itself** — not by recreating the account:

1. Log into `/admin/login` on the real deployed URL with the current password.
2. Go to **Settings** (`/admin/settings`) → **Change Password** card (built
   in Module 12).
3. Set a new password there. This is the only step in this whole document
   that intentionally wasn't done ahead of time — it needs the live
   deployment to exist first, and needs whoever's doing this to have (or be
   given, out of band) the current password, which isn't something to paste
   into a chat transcript either.

## 4. Deploying (Vercel)

1. ~~**GitHub**~~ — done: pushed to
   `https://github.com/Girish0309/Naprocs_news`, branch `master`. `.env.local`
   was confirmed gitignored (`git check-ignore -v`) before pushing, so no
   secrets went up with it.
2. **Vercel**: New Project → Import the GitHub repo → Next.js is
   auto-detected (no build command overrides needed) → add the 8 env vars
   from §2 (Production environment; add them to Preview too if preview
   deployments should also work against real data — see §7) → Deploy.
3. Vercel's GitHub integration auto-deploys on every push to the connected
   branch by default — confirm this is actually on (Project Settings →
   Git) rather than assuming it, since it's occasionally turned off
   deliberately on shared repos.

## 5. Post-deploy smoke test

Run this once, against the real live URL, before considering the deploy
done — same shape as the full-loop test from Module 5's build, now for real:

1. Log into `/admin/login` with the (about-to-be-rotated, see §3.4) admin
   credentials.
2. Create a draft article, upload a real cover image, confirm the Module 4
   pipeline actually runs (uploading → verifying → verified) against real
   Cloudinary — not the `CLOUDINARY_MOCK` test double from Module 13's E2E
   suite, which only exists in that suite's own config.
3. Publish it. Confirm the "View live" link uses the real production domain.
4. Open that URL in a private/incognito window (no admin session). Confirm
   the article renders, the cover image loads, comments and the like button
   work.
5. Submit a real comment and a real like as that anonymous visitor.
6. Confirm the homepage lists the new article and the inline search finds it.
7. View source on the live article page — confirm the `<meta>` tags and the
   `application/ld+json` JSON-LD block (Module 10) are present and reference
   the real domain, not `localhost`.
8. Trigger the login rate limit for real: 6 failed login attempts in a row
   from the same IP should get rejected on the 6th, and it should be coming
   from Upstash actually responding (check the Upstash dashboard's request
   count ticks up), not from `lib/rate-limit.ts`'s fail-open dev-mode
   fallback — that fallback only activates when Upstash credentials are
   *absent*, so if they're set correctly in Vercel this should already be
   the real path, but this step is what actually confirms it rather than
   assuming it.

## 6. Ongoing maintenance

- **Redeploying**: `git push` to the connected branch — Vercel's GitHub
  integration rebuilds and redeploys automatically (confirm this is on, per
  §4 step 3). No manual redeploy step needed for routine changes.
- **MongoDB Atlas M0 free tier storage ceiling**: M0 caps out at **512MB**
  total storage across all databases in the cluster. Check current usage in
  the Atlas dashboard under the cluster's **Metrics** tab (or **Database** →
  a collection's stats) — this wasn't checked while writing this doc since
  it needs dashboard access. For a text-and-metadata newsletter (articles,
  comments, reactions — no attached binary files; images live in Cloudinary,
  not MongoDB), 512MB is a lot of articles, likely thousands, but check
  periodically rather than finding out from an error. When it's time to
  upgrade, M10 (the first paid, dedicated tier) is the natural next step and
  is also when Network Peering/PrivateLink (§3.1) become available.
- **Admin password**: rotate again periodically via the same Settings page
  used in §3.4 — there's no forced-rotation mechanism built, this is a
  manual habit.

## 7. Known limitations (written down, not fixed now)

- No custom domain yet — running on the default `*.vercel.app` URL. Adding
  one later just means updating `NEXTAUTH_URL` and the DNS records; no code
  changes.
- No separate staging environment — Preview deployments (if enabled) would
  share the same production database and third-party credentials unless
  given their own, which means testing in a preview deployment can write
  real data into the production database. Worth a dedicated staging Atlas
  database + its own Cloudinary/Upstash credentials if this becomes a real
  workflow need.
- MongoDB Atlas M0 (free tier) — see §6's storage note; also has lower
  connection-count and performance ceilings than a paid tier, fine for
  current expected traffic.
- The `comment_count` idempotency gap flagged in the Module 1-7 audit
  (item B.6) is an explicit, deliberate V1.1 item — not addressed here.
- No uptime/error monitoring (Sentry, Vercel's own Analytics/Speed Insights,
  etc.) wired up yet — worth adding once there's real traffic to watch.

## 8. What's actually done vs. what needs direct account access

Done directly, without needing any external account:
- Confirmed the codebase has zero Vercel-specific or Edge-runtime
  dependencies (§1).
- Ran a real `next build` against a temporary real MongoDB instance —
  confirmed it completes cleanly, including `generateStaticParams`'s
  build-time DB query for the article page.
- Ran a real `next start` (production mode) locally with a realistic
  production-shaped `NEXTAUTH_URL` and confirmed `sitemap.xml`/`robots.txt`
  correctly resolve every URL against that domain rather than `localhost` —
  proving §2's build-time-vs-runtime env var behavior is correct without
  needing an actual deployment to prove it.
- Generated a fresh `NEXTAUTH_SECRET` for production (§3.3).
- Committed all outstanding Module 1-13 work to git locally (two commits:
  the application through Module 12, then Module 13's test suite) — see
  `DEVIATIONS.md`'s Module 14 section for why this is two commits and not
  a fabricated thirteen.
- Created the `origin` remote and pushed to
  `https://github.com/Girish0309/Naprocs_news` (branch `master`), after
  confirming `.env.local` was actually gitignored rather than assuming it.

Needs direct account access this session didn't have:
- MongoDB Atlas dashboard — §3.2's scoped user, and §6's storage check.
- The actual Vercel project creation, env var entry, and deploy trigger —
  by request, left for whoever's driving the actual hosting account.
- §3.4's admin password rotation and §5's live smoke test — both need the
  deployment to exist first.
