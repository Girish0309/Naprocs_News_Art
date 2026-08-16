# Handover

Read this first. It exists so you (or anyone new) can pick this codebase up cold —
what's actually done, what's a genuine known gap vs. a deliberate scope decision, where
the other docs live, and how to get a clone running. Everything here is cross-checked
against `DEVIATIONS.md` and `DEPLOYMENT.md` rather than guessed; where something's
uncertain, it says so instead of asserting it.

## What this is

A complete, working newsletter platform: a public reading site (essays, archive,
search, comments, reactions) and a private admin console (article editor with
autosave/publish, comment moderation, dashboard). Not a scaffold — see `README.md`'s
folder structure for what's actually implemented.

## Known limitations, right now

Checked against `DEVIATIONS.md` and `DEPLOYMENT.md` §7 rather than assumed current:

- **No "Unpublish" button in the admin UI.** The underlying mechanism works (PATCH an
  article's `status` back to `"draft"` correctly triggers revalidation and the public
  page 404s again within milliseconds — verified live, see `DEVIATIONS.md`), but nothing
  in `DashboardContent.tsx`'s row menu or `ArticleForm.tsx`'s sidebar exposes it.
  Deliberately scoped out during the comment-management work as "a separate, later
  feature addition, not a bug fix" — still true.
- **`comment_count` has a known idempotency gap** (Module 1-7 audit, item B.6) — an
  explicit, deliberate "not addressed here" item per `DEPLOYMENT.md` §7, not forgotten.
- **2FA is groundwork only, not enforced at login.** `/api/admin/2fa/setup` generates
  and persists a TOTP secret; `authorize()` never checks it. The login form's TOTP step
  is visual-only.
- **Several buttons are intentionally inert placeholders**, each labeled "Not built
  yet" in its own `title` attribute so this is discoverable at the UI level, not just
  in this file: Preview (article editor), Support (admin sidebar), Share/Bookmark
  (article page). The public site footer's Privacy Policy/Terms of Service/Contact/RSS
  links are still dead `href="#"` placeholders — never addressed by any module.
- **No custom domain, no separate staging environment, MongoDB Atlas is on the M0
  (free) tier, no uptime/error monitoring wired up** — all per `DEPLOYMENT.md` §7,
  which has the full reasoning and what each would take to add.
- **Minor, non-blocking, found during this handover pass**: `CommentsQueue.tsx`'s
  article-title link has no `break-words` (unlike the comment body right below it) —
  a pathologically long unbroken article title could overflow it the same way
  `DashboardContent.tsx`'s title cell once did. Flagged, not fixed, since it's a
  different bug shape than what was being worked on at the time.
- **One harmless lint warning**: `components/admin/AdminShell.tsx` has an "unused
  eslint-disable directive" warning (not an error) left over from an earlier fix that
  made the directive unnecessary. Cosmetic; `eslint .` reports zero errors project-wide.

## Where everything else lives

| Doc | Covers |
|---|---|
| `README.md` | Stack, full folder structure, local setup, running the test suite |
| `DEPLOYMENT.md` | Is this app portable, env vars for production, pre-deploy security steps, actually deploying, post-deploy smoke test, ongoing maintenance, known limitations, what's done vs. what needs account access |
| `ENGINEERING_STANDARDS.md` | F1-F7 (frontend) / B1-B8 (backend) rules traced to real bugs this project has hit — read before starting a feature, check against before finishing one |
| `DEVIATIONS.md` | Every deliberate simplification, deferred feature, and judgment call made across this project's entire history, module by module, with the reasoning behind each — the primary source of truth for "why does it work this way" |
| `testing/test-case-matrix.md` | The spec the automated suite is written against, one row per scenario, mapped to `tests/unit/`, `tests/integration/`, and `e2e/` |
| `audit/` | Point-in-time audit reports (layout/UX pass, engineering-standards compliance check) — historical findings as of when they were written, not living documents; check `DEVIATIONS.md` for whether something they flagged has since been addressed |

## Getting a fresh clone running

Full detail is in `README.md`'s "Running locally" section — in short:

```bash
npm install
cp .env.local.example .env.local   # fill in real values — see README.md for what each does
npm run create-admin               # provision the one admin account; no public signup exists
npm run dev
```

Then `npm test` and `npm run test:e2e` to confirm the suite passes against your setup —
neither touches the real database/Cloudinary/Upstash from `.env.local`.
