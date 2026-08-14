# Naprocs Newsletter

Admin console + public reading site for Naprocs Tech articles. Admins write and publish
articles from a private console; the public site serves published articles with comments
and like/dislike reactions.

This is a structural scaffold: routing, types, and the DB connection are fully wired, but
most business logic (article CRUD, image upload, comments, reactions, search) is left as
typed stubs with `TODO` comments, to be filled in feature by feature.

## Stack

- Next.js 16 (App Router, TypeScript) — note: `middleware.ts` is deprecated in Next 16
  in favor of `proxy.ts` (same behavior, renamed file/export); this project uses `proxy.ts`.
- MongoDB + Mongoose
- NextAuth.js (credentials provider) — admin-only login, no public signup
- Upstash Redis — rate limiting (`lib/rate-limit.ts`)
- otplib + qrcode — TOTP 2FA groundwork (`/api/admin/2fa/setup`), not yet enforced at login
- Tailwind CSS v3
- Tiptap — rich text article editor
- Cloudinary — cover image storage
- Zod — API input validation

## Folder structure

```
app/
  (public)/              Public reading site (cream theme)
    layout.tsx
    page.tsx              → homepage / article listing
    articles/[slug]/      → single article page
    search/               → search results

  (admin)/                Admin console (near-black theme)
    admin/
      login/               → sign-in page (NextAuth credentials, rate-limited)
      dashboard/           → includes the sign-out form
      articles/new/
      articles/[id]/edit/
      comments/            → comment moderation queue

  api/
    auth/[...nextauth]/    NextAuth route handler
    admin/
      login/               rate-limit pre-flight check the login form calls before signIn()
      2fa/setup/           POST — generates + persists a TOTP secret and QR code (groundwork,
                            not yet enforced at login)
      articles/            GET (list), POST (create)
      articles/[id]/       PUT (update), DELETE
      upload-image/        POST — Cloudinary cover image upload
      comments/            GET (moderation list), PATCH (approve/reject)
    articles/              GET (public list)
    articles/[slug]/       GET (public single article)
    articles/[id]/comments/  POST (submit a comment)
    articles/[id]/react/     POST (like/dislike)
    search/                 GET (public search)

  sitemap.ts               Dynamic sitemap, queries published article slugs
  error.tsx                Root error boundary
  not-found.tsx            Global 404 page

proxy.ts                  Route protection for /admin/* (Next 16's renamed middleware.ts —
                           same behavior, redirects to /admin/login when there's no valid session)
instrumentation.ts         Runs lib/env.ts validation once when the server starts

components/
  admin/
    ArticleEditor.tsx      Reusable Tiptap editor (headings, bold/italic, lists, links, blockquote)
    ArticleForm.tsx         Title input + editor + save button shell (new/edit pages)
    LoginForm.tsx           Client-side credentials sign-in form (calls the rate-limit
                            pre-flight, then NextAuth's signIn())

lib/
  db.ts                    Cached MongoDB connection (safe across dev hot-reloads),
                           logs connection errors, resets its promise cache on failure
  env.ts                   Throws a clear error at startup if required env vars are missing
  auth.ts                  NextAuth config + requireAdminSession()/getServerAuthSession()
  auth-cookie-config.ts    Shared session cookie name/secure-flag logic (used by lib/auth.ts
                           and proxy.ts, kept dependency-free so proxy.ts stays lightweight)
  auth-actions.ts          logout() server action — clears the session cookie, redirects to
                           /admin/login
  rate-limit.ts            Reusable Upstash-backed rate limiter: rateLimit(key, limit, window)
  get-client-ip.ts         Extracts the client IP from request headers
  cloudinary.ts             Configured Cloudinary SDK instance

models/
  Admin.ts, Article.ts, Comment.ts, Reaction.ts   Mongoose schemas

scripts/
  create-admin.ts           CLI to create the first admin account (validates email format
                            and password length before hashing)

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
   - `NEXTAUTH_URL` — `http://localhost:3000` in development
   - `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` — from your
     Cloudinary dashboard
   - `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — from the
     [Upstash console](https://console.upstash.com/redis); powers login rate limiting.
     If left blank, rate limiting fails open (logs a warning, allows all requests) so
     local dev isn't blocked before you set this up.

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
   `/admin/dashboard` and see "Signed in as \<email\>".
4. Click "Sign out" on the dashboard — you should be redirected back to `/admin/login`,
   and visiting `/admin/dashboard` again should redirect you back to the login page.
5. To test rate limiting, set `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` in
   `.env.local` (a free Upstash database works), then submit the login form with a wrong
   password 5 times within 15 minutes — the 6th attempt should show "Too many login
   attempts. Please try again later." instead of hitting NextAuth at all.
