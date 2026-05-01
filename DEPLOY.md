# TreeLot — Vercel Deploy Runbook

This runbook walks you through deploying TreeLot to Vercel. Allow ~30 minutes
end-to-end. Everything code-side is already done; the steps below are all
manual / dashboard work.

The canonical list of environment variables is `.env.local.example` — open it
side-by-side with the Vercel "Environment Variables" page as you go.

---

## 1. Push the repo to a Git remote

This repo is currently not linked to a remote. Vercel needs a remote to deploy
from.

```bash
git init                                  # if not already init'd
git remote add origin git@github.com:YOUR_ORG/treelot.git
git add -A
git commit -m "Initial deploy"
git branch -M main
git push -u origin main
```

---

## 2. Create the Vercel project

1. Vercel dashboard → **Add New → Project**.
2. Import the repo you just pushed.
3. Framework Preset: **Next.js** (auto-detected).
4. Build command: leave default (`next build`).
5. Output directory: leave default.
6. Root directory: leave default.
7. Production branch: **`main`**.
8. **Don't** click Deploy yet — we need to set env vars first.

---

## 3. Clerk — production application

1. Clerk dashboard → create a new **Production application** (or upgrade your
   existing dev app to production).
2. Copy the keys into Vercel → Settings → Environment Variables:
   - `CLERK_SECRET_KEY` → `sk_live_…`
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` → `pk_live_…`
3. In the Clerk dashboard → **Domains**: add your Vercel URL (e.g.
   `treelot.vercel.app` and any custom domain) to allowed origins.
4. Clerk dashboard → **Paths**:
   - Sign-in URL: `/sign-in`
   - Sign-up URL: `/sign-up`
   - After sign-in URL: `/onboarding`
   - After sign-up URL: `/onboarding`
   > Heads-up: the dev `.env.local` currently has `AFTER_SIGN_IN_URL=/pos`.
   > For production we want `/onboarding` so the create-org / accept-invite
   > flow always runs first. Set `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` and
   > `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` to `/onboarding` on Vercel and in
   > the Clerk dashboard's Paths config.
5. (Optional) Clerk → **Email & SMS templates**: brand the invitation /
   welcome / password-reset emails.

---

## 4. Database — Neon

Two options. Pick one.

### Option A: reuse the existing dev Neon database

Fast path for MVP. Copy the `DATABASE_URL` from `.env.local` into the Vercel
env vars verbatim. Migrations are already applied.

### Option B: create a separate production database (recommended)

1. Neon dashboard → **New project** (or new branch off the existing one).
2. Copy the **pooled** connection string.
3. Set `DATABASE_URL` in Vercel to that pooled string.
4. From your local machine, run migrations against the new prod URL:
   ```bash
   DATABASE_URL="<prod-url>" npm run db:migrate
   ```
   (`db:migrate` is a wrapper for `prisma migrate deploy`.)

> Note on migrations and Vercel: we deliberately do **not** run
> `prisma migrate deploy` inside the Vercel build. Running it during builds can
> race when concurrent deploys overlap. Instead, run it manually before the
> first deploy (and before any future deploy that adds a migration). For
> automated migration on each push, set up a Vercel **Build Hook** + a
> separate `db:migrate` script triggered before `vercel deploy` — out of scope
> for the MVP.

`prisma generate` _does_ run on Vercel — it's wired up via the `postinstall`
script in `package.json`, which Vercel runs after `npm install`.

---

## 5. Sentry (optional)

Skip this section to disable Sentry — the app no-ops cleanly when DSN is unset.

1. Sentry dashboard → create a new project (platform: **Next.js**).
2. Copy the DSN. In Vercel set:
   - `NEXT_PUBLIC_SENTRY_DSN` = the DSN
   - `SENTRY_DSN` = the same DSN (the server-side init reads this one)
3. (Optional, for source-map upload during build) Sentry → **Settings → Auth
   Tokens** → create token with `project:releases` scope. Set on Vercel:
   - `SENTRY_ORG` = your org slug
   - `SENTRY_PROJECT` = the project slug
   - `SENTRY_AUTH_TOKEN` = the token
   Without these three, source-map upload is skipped automatically.

---

## 6. PostHog (optional)

Skip this section to disable PostHog — `PostHogProvider` no-ops cleanly when
the key is unset.

1. PostHog → create a new project.
2. Copy the project API key. In Vercel set:
   - `NEXT_PUBLIC_POSTHOG_KEY` = the key
   - `NEXT_PUBLIC_POSTHOG_HOST` = `https://us.i.posthog.com` (or
     `https://eu.i.posthog.com` if you chose EU when creating the project —
     getting this wrong silently drops events).

---

## 7. Set every environment variable on Vercel

Open `.env.local.example` and walk down the list. For each var, paste it into
Vercel → Settings → Environment Variables, scoped to **Production** (and
**Preview** if you want preview deployments to work).

The one nobody remembers:

- `NEXT_PUBLIC_APP_URL` — full URL of the deployed app, no trailing slash.
  Used by `admin.inviteUser` to build the invitation redirect URL. If unset,
  invitations link to `localhost:3002` and break.

---

## 8. First deploy

1. Vercel → Deployments → **Redeploy** (or just push a commit to `main`).
2. Once green, smoke-test:
   ```bash
   curl https://YOUR-URL/api/health
   # → {"ok":true,"version":"<7-char-sha>"}
   ```
3. Open `/sign-in` — Clerk UI should load.
4. Sign up as the first owner. You should land on `/onboarding` and run
   through the create-org flow.

---

## 9. Smoke test the happy path

- Sign up → create org → land on `/pos`.
- POS: search a customer → create one → ring a sale.
- `/shift` reflects the sale.
- `/settings` → invite a teammate → check Clerk dashboard → **Logs** to
  confirm the invitation email was dispatched.
- `/driver` loads as a public route.

---

## 10. TODOs for later (not blockers for MVP)

- **Custom domain** — Vercel → Settings → Domains. Update
  `NEXT_PUBLIC_APP_URL` afterwards.
- **CSP headers** — deliberately omitted. Clerk and PostHog both have
  specific allowed-origin requirements that are easy to misconfigure. Add
  via `headers()` in `next.config.ts` once you've stabilized the integrations.
- **Production database backups** — Neon supports point-in-time restore on
  paid plans. Verify your branch has it enabled.
- **Sentry source maps** — set `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` +
  `SENTRY_PROJECT` to get readable stack traces.
- **PostHog dashboards / funnels** — wire up sign-up → first-sale funnel
  once the property names stabilize.
- **Automated migrations** — set up a Vercel build hook or GitHub Action that
  runs `npm run db:migrate` before `vercel deploy`.

---

## Files / scripts cheat sheet

- `npm run db:migrate` — `prisma migrate deploy` against the current
  `DATABASE_URL`. Run before each deploy that adds a migration.
- `npm run build` — what Vercel runs. Locally, also exercises the Sentry
  webpack plugin if `SENTRY_AUTH_TOKEN` is set.
- `/api/health` — public health check.
- `proxy.ts` — the Next.js 16 auth proxy (replaces `middleware.ts`). Edit
  `isPublicRoute` to add new public routes.
