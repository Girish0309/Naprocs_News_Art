# Naprocs Newsletter

Admin console + public reading site for Naprocs Tech articles. Admins write, autosave,
and publish articles from a private console; the public site serves published articles
with comments, like/dislike reactions, search, an archive, and an about page.

This is a complete, working application — routing, auth, article CRUD, image upload,
comments with spam filtering and moderation, reactions, search, and both the public
site and admin console's mobile navigation are all implemented and tested (see
`testing/test-case-matrix.md` and the `tests/`/`e2e/` suites). For a new developer's
orientation — what's actually done, what's genuinely still a known gap, and where each
doc below lives — start with `HANDOVER.md`, not this file.

## Stack

- Next.js 16 (App Router, TypeScript) — note: `middleware.ts` is deprecated in Next 16
  in favor of `proxy.ts` (same behavior, renamed file/export); this project uses `proxy.ts`.
- MongoDB + Mongoose
- NextAuth.js (credentials provider) — admin-only login, no public signup
- Upstash Redis — rate limiting (`lib/rate-limit.ts`), with an explicit timeout and a
  documented fail-open-dev/fail-closed-production policy when unreachable
- Tailwind CSS v3
- Tiptap — rich text article editor
- Cloudinary — cover image storage, with an explicit upload timeout
- Zod — API input validation

## Folder structure

```
app/
  (public)/              Public reading site (cream "Journal" theme)
    layout.tsx             → SiteHeader (desktop + mobile drawer nav), footer
    page.tsx                → homepage / latest-articles listing
    archive/                → full chronological article listing ("Load More")
    about/                  → mission + contact (placeholder copy pending real content)
    articles/[slug]/        → single article page
    search/                 → search results

  (admin)/                Admin console (near-black "Editorial" theme)
    admin.css
    admin/
      login/               → sign-in page (NextAuth credentials, rate-limited)
      dashboard/           → article list, All/Published/Drafts filter, search
      articles/new/, articles/[id]/edit/   → the article editor
      comments/            → comment management (All/Flagged tabs, not flagged-only)
      settings/

  api/
    auth/[...nextauth]/    NextAuth route handler
    admin/
      login/               rate-limit pre-flight check the login form calls before signIn()
      change-password/     POST
      articles/            GET (list), POST (create)
      articles/[id]/       PUT/PATCH (update), DELETE
      upload-image/        POST — Cloudinary cover image upload (magic-byte checked,
                            re-encoded, dimension-gated, explicit timeout)
      comments/            GET (status=flagged|visible|removed|all), PATCH (moderate)
    articles/              GET (public list, paginated, optional ?tag=)
    articles/[slug]/       GET (public single article)
    articles/[id]/comments/  GET, POST (submit a comment)
    articles/[id]/react/     GET, POST (like/dislike)
    search/                 GET (public search)

  sitemap.ts, robots.ts    Dynamic, query published article slugs
  error.tsx, not-found.tsx Root error boundary / global 404

proxy.ts                  Route protection for /admin/* (Next 16's renamed middleware.ts —
                           same behavior, redirects to /admin/login when there's no valid session)
instrumentation.ts         Runs lib/env.ts validation once when the server starts

components/
  admin/
    AdminShell.tsx          Sidebar (desktop) + slide-in drawer (mobile) shell every admin page renders inside
    ArticleEditor.tsx        Reusable Tiptap editor (headings, bold/italic, lists, links, blockquote)
    ArticleForm.tsx           Title → Excerpt → Body keyboard flow, autosave, publish, cover upload
    DashboardContent.tsx     Article list/filter/search
    CommentsQueue.tsx        All/Flagged comment management
    CoverImageUploader.tsx, LoginForm.tsx, DbErrorFallback.tsx
  public/
    SiteHeader.tsx           Desktop + mobile drawer nav (Essays/Archive/About)
    ArticleRow.tsx, ArchiveArticleList.tsx, CommentSection.tsx, DbErrorFallback.tsx

lib/
  db.ts                    Cached MongoDB connection (safe across dev hot-reloads), an
                           explicit serverSelectionTimeoutMS, and a DatabaseConnectionError
                           type callers use to show a calm fallback instead of a raw crash
  with-db-error-handling.ts  Route Handler wrapper turning that error into a calm 503
  env.ts                   Throws a clear error at startup if required env vars are missing
  auth.ts                  NextAuth config + requireAdminSession()/getServerAuthSession()
  auth-cookie-config.ts    Shared session cookie name/secure-flag logic (used by lib/auth.ts
                           and proxy.ts, kept dependency-free so proxy.ts stays lightweight)
  auth-actions.ts          logout() server action — clears the session cookie, redirects to
                           /admin/login
  rate-limit.ts            Upstash-backed rate limiter with an explicit timeout; fails open
                           outside production / closed in production when unreachable
  get-client-ip.ts         Extracts the client IP from request headers
  cloudinary.ts            Configured Cloudinary SDK instance (with a CLOUDINARY_MOCK test
                           double, used only by the E2E suite)
  article-text.ts, article-search.ts, article-publish-validation.ts, sanitize.ts, slug.ts,
  site-config.ts, query-params.ts

models/
  Admin.ts, Article.ts, Comment.ts, Reaction.ts   Mongoose schemas

scripts/
  create-admin.ts           CLI to create an admin account (validates email format
                            and password length before hashing)
  backfill-body-text.ts     One-time migration (Module 9) — kept as a record/reusable tool

audit/                     Point-in-time audit reports (layout/UX, engineering-standards
                           compliance) — historical findings, not living docs
ENGINEERING_STANDARDS.md    F1-F7/B1-B8 rules traced to real bugs this project has hit —
                           read before starting a feature, check against before finishing one
DEVIATIONS.md               Every deliberate simplification, deferred feature, and judgment
                           call made across this project's history, with reasoning
HANDOVER.md                Start here if you're new to this codebase

types/
  next-auth.d.ts            Session/JWT type augmentation
```

## Running locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the env example and fill in real values:

   ```bash
   cp .env.local.example .env.local
   ```

   - `MONGODB_URI` — your MongoDB connection string (**required** — the app throws a
     clear startup error if this is missing)
   - `NEXTAUTH_SECRET` — generate with `openssl rand -base64 32` (**required**, same as above)
   - `NEXTAUTH_URL` — `http://localhost:3000` in development; also doubles as the site's
     public base URL for sitemap/canonical/OG links
   - `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` — from your
     Cloudinary dashboard
   - `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — from the
     [Upstash console](https://console.upstash.com/redis); powers login/comment/reaction
     rate limiting. If left blank, rate limiting fails open (logs a warning, allows all
     requests) so local dev isn't blocked before you set this up — it fails *closed* in
     production under the same condition (see `lib/rate-limit.ts`).

3. Start the dev server:

   ```bash
   npm run dev
   ```

   Public site: [http://localhost:3000](http://localhost:3000)
   Admin login: [http://localhost:3000/admin/login](http://localhost:3000/admin/login)

## Creating the first admin account

There is no public registration route anywhere in the app — admins are provisioned via CLI:

```bash
npm run create-admin
# or directly:
npx tsx scripts/create-admin.ts
```

You'll be prompted for a name, email, and password. Email format and a minimum password
length of 8 characters are validated before anything is hashed. The password is hashed
with bcrypt (cost factor 12) before being stored, and the script refuses to run if an
admin with that email already exists. Run this once your `MONGODB_URI` in `.env.local`
is reachable.

## Testing the auth loop locally

1. `npm run create-admin` and follow the prompts to create a test admin.
2. `npm run dev`, then visit [http://localhost:3000/admin/dashboard](http://localhost:3000/admin/dashboard)
   while logged out — `proxy.ts` should redirect you to `/admin/login`.
3. Log in with the test admin's credentials at `/admin/login` — you should land on
   `/admin/dashboard`.
4. Click "Log Out" in the sidebar — you should be redirected back to `/admin/login`,
   and visiting `/admin/dashboard` again should redirect you back to the login page.
5. To test rate limiting, set `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` in
   `.env.local` (a free Upstash database works), then submit the login form with a wrong
   password 5 times within 15 minutes — the 6th attempt should show "Too many login
   attempts. Please try again later." instead of hitting NextAuth at all.

## Running the test suite

```bash
npm test           # Vitest — unit + integration, against a real mongodb-memory-server
npm run test:e2e   # Playwright — full browser flows against a real (isolated) dev server
```

Both are safe to run repeatedly — neither touches the real `MONGODB_URI`/Cloudinary/
Upstash from `.env.local`; see `testing/test-case-matrix.md` for what's covered.
