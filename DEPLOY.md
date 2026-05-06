# TreeLot — Vercel Deploy Runbook

This runbook walks you through deploying TreeLot to Vercel. Allow ~30 minutes
end-to-end. Everything code-side is already done; the steps below are all
manual / dashboard work.

The canonical list of environment variables is `.env.local.example` — open it
side-by-side with the Vercel "Environment Variables" page as you go.

## Environment topology (decided in Decision 2)

Two-environment split:

- **Local (`.env.local`) + Vercel Preview** → `treelot-dev` Supabase project + Clerk Test instance.
- **Vercel Production** → `treelot-prod` Supabase project + Clerk Production instance.

Most Vercel env vars are set to the same value across Production + Preview.
The handful that **must differ** are flagged as `PER-ENV` in
`.env.local.example` and called out in §4 / §7 below.

---

## 0. Local dev quickstart (one-time per fresh dev DB)

After cloning + `npm install` + `npm run db:migrate`, populate the dev DB and
bind your Clerk identity to the demo org so Google sign-in lands on the
dashboard instead of `/onboarding`:

```bash
npm run seed:demo            # customers / purchases / deliveries
# Sign in once at http://localhost:3002/sign-in via Google so the Clerk user exists.
npm run claim:demo-owner     # binds your ADMIN_EMAIL → demo org as owner
```

`claim:demo-owner` reads `ADMIN_EMAIL` + `CLERK_SECRET_KEY` from `.env.local`,
looks you up via the Clerk SDK, and upserts a User row at `DEMO_USER_ID` in
the demo org. It refuses to run when `VERCEL_ENV` or `NODE_ENV` is
`production` (same posture as `set-driver-pin.ts`). The `seed:demo` wipe
does not touch users, so you only run `claim:demo-owner` once per dev DB
(or after rotating `ADMIN_EMAIL`).

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

## 4. Database — Supabase (PER-ENV)

The chosen pattern (Decision 2): **two Supabase projects** — one for dev +
Vercel Preview, one for production. Local `.env.local` continues pointing at
the dev project.

### One-time prod-DB setup

1. Supabase dashboard → **New project** named `treelot-prod` (region close to
   your Vercel deploy region).
   - Auto-RLS off (we enforce scoping in tRPC; RLS at DB level would be redundant + a footgun).
   - Auto-expose tables off (we use tRPC, don't need PostgREST endpoints).
   - Set a strong DB password and save it in 1Password / a vault.
2. Project Settings → Database → Connection string. Copy **both**:
   - **Pooled** (port `6543`) → this becomes prod's `DATABASE_URL`.
   - **Direct** (port `5432`) → this becomes prod's `DIRECT_URL`.
3. From your laptop, apply migrations to the empty prod DB:
   ```bash
   DATABASE_URL="<prod-pooled-url>" DIRECT_URL="<prod-direct-url>" npm run db:migrate
   ```
   (`db:migrate` is a wrapper for `prisma migrate deploy`.)
4. In Vercel (§7 below), set `DATABASE_URL` and `DIRECT_URL` **scoped to
   Production only** with the prod URLs. Set the same vars **scoped to Preview
   only** with the existing dev URLs (the values currently in `.env.local`).

> Note on migrations and Vercel: we deliberately do **not** run
> `prisma migrate deploy` inside the Vercel build. Running it during builds
> can race when concurrent deploys overlap. Instead, run it manually before
> the first deploy (and before any future deploy that adds a migration). For
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

Open `.env.local.example` and walk down the list. Vercel scopes each variable
to one or more of three environments: **Development / Preview / Production**.
Most variables get the same value in Preview + Production. The `PER-ENV` ones
get **different values per scope**:

| Variable | Production scope | Preview scope |
|---|---|---|
| `DATABASE_URL` | `treelot-prod` pooled URL | `treelot-dev` pooled URL |
| `DIRECT_URL` | `treelot-prod` direct URL | `treelot-dev` direct URL |
| `CLERK_SECRET_KEY` | `sk_live_…` (Clerk Production) | `sk_test_…` (Clerk Test) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_…` | `pk_test_…` |
| `DRIVER_SESSION_SECRET` | freshly-generated prod secret | dev secret (matches `.env.local`) |

Generate a brand-new prod `DRIVER_SESSION_SECRET` with `openssl rand -base64 48`
and paste it **only** into Vercel's Production scope. Don't reuse the dev one.

Same in both scopes (typically):

- `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/onboarding`
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding`
- `ADMIN_EMAIL` — superadmin email (same person across environments)
- `TAXJAR_API_KEY` — free tier covers both environments
- Sentry / PostHog DSNs — only set in Production unless you specifically want
  preview-deploy errors flowing into the same project.

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
- **Production database backups** — Supabase paid plans include daily backups
  + point-in-time recovery (PITR). Free tier has daily backups for 7 days
  only. Upgrade `treelot-prod` once your friend's lot is on it.
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
- `npm run claim:demo-owner` — local-only. Binds `ADMIN_EMAIL`'s Clerk user
  to the demo org as owner so Google sign-in skips `/onboarding`. See §0.
- `npm run build` — what Vercel runs. Locally, also exercises the Sentry
  webpack plugin if `SENTRY_AUTH_TOKEN` is set.
- `/api/health` — public health check.
- `proxy.ts` — the Next.js 16 auth proxy (replaces `middleware.ts`). Edit
  `isPublicRoute` to add new public routes.

---

## 11. Troubleshooting — gotchas hit during first prod deploy

Field notes from setting up `treelot-prod` on 2026-05-04. Each gotcha follows
the same shape: **symptom → root cause → fix → verification**. Scan the
section headers; only read the body of the one matching what you're seeing.

### 11.1 Supabase free-tier direct connection is IPv6-only

**Symptom.** `prisma migrate deploy` fails with
`P1000: Authentication failed against database server`, even though the
password is correct. Or `db:migrate` reports "No pending migrations to apply"
against an empty prod DB (i.e. it silently no-op'd against dev).

**Root cause.** The Supabase direct endpoint
(`db.<projectref>.supabase.co:5432`) returns only AAAA (IPv6) records on free
tier. From an IPv4-only network the connection never completes; Prisma
mistranslates the network failure as an auth failure.

**Fix.** Use the **Session Pooler** for `DIRECT_URL` instead of the direct
connection. Both pooler endpoints are IPv4-proxied for free.

| Var | Value | Port | User |
|---|---|---|---|
| `DATABASE_URL` | Transaction Pooler | 6543 | `postgres.<projectref>` |
| `DIRECT_URL` | Session Pooler | 5432 | `postgres.<projectref>` |

In the Supabase Connect modal there are three tabs: **Direct connection**
(skip — IPv6-only), **Transaction Pooler** (use for `DATABASE_URL`),
**Session Pooler** (use for `DIRECT_URL`). Both pooler URLs share the
`aws-1-<region>.pooler.supabase.com` host.

**Verification.**
```bash
# Prove the direct endpoint is IPv6-only:
dig +short A    db.<projectref>.supabase.co   # empty → IPv6-only
dig +short AAAA db.<projectref>.supabase.co   # returns address

# Prove the pooler is IPv4:
dig +short A aws-1-<region>.pooler.supabase.com   # returns addresses

# A successful migrate-deploy run will show the pooler hostname:
DATABASE_URL="<prod>" DIRECT_URL="<prod-session-pooler>" npm run db:migrate 2>&1 \
  | grep "Datasource"
# Datasource "db": PostgreSQL "postgres" at "aws-1-...:5432"
```

### 11.2 `prisma.config.ts` clobbering inline env vars

**Symptom.** You run
`DATABASE_URL="<prod-url>" npm run db:migrate` to migrate prod, but the
output reports it migrated against the dev database. "No pending migrations"
because dev was already migrated — silently a no-op against prod.

**Root cause.** A previous version of `prisma.config.ts` loaded `.env.local`
with `override: true`, which made dotenv replace inline shell env vars with
the file's values. Prod URLs got overwritten by dev URLs before Prisma read
them.

**Fix.** Already in tree. `prisma.config.ts` now uses standard dotenv
precedence — shell env wins, then `.env.local`, then `.env`:

```ts
config({ path: ".env.local" });   // override defaults to false
config();
```

Don't reintroduce `override: true` on the `.env.local` line. If anyone does,
this bug comes back silently.

**Verification.** Always grep the migrate output for the Datasource line and
confirm it shows the prod project ref / pooler, not the dev one.

### 11.3 Clerk production needs satellite-domain DNS records

**Symptom.** Sign-in page renders an empty container — no Clerk widget. The
HTML embeds a script tag like
`<script src="https://clerk.<your-domain>/...">` but the browser fails to
load it. Console shows "Failed to load Clerk JS" with `connectEnd: 0ms` and
`transferSize: 0` in the Network tab Performance API.

**Root cause.** Clerk production instances use a **satellite domain pattern**
— Clerk's JavaScript SDK is served from `clerk.<your-domain>`, not from
Clerk-owned hosts. The publishable key embeds this hostname (decode
`pk_live_<base64>` to see). Until you add CNAMEs pointing the satellite
subdomains at Clerk's CDN, the script tag resolves to nowhere and the SDK
never initializes.

Dev Clerk instances serve JS from `*.clerk.accounts.dev` (Clerk-owned), so
this issue is invisible until first prod deploy.

**Fix.** Get the exact CNAME values from Clerk dashboard → Production →
**Domains**. Add five CNAMEs at your DNS provider:

| Host (relative)   | Value                                          | Purpose            |
|-------------------|------------------------------------------------|--------------------|
| `accounts`        | `accounts.clerk.services`                      | Account portal     |
| `clerk`           | `frontend-api.clerk.services`                  | Frontend API + JS  |
| `clk._domainkey`  | `dkim1.<random-id>.clerk.services`             | DKIM (email auth)  |
| `clk2._domainkey` | `dkim2.<random-id>.clerk.services`             | DKIM (email auth)  |
| `clkmail`         | `mail.<random-id>.clerk.services`              | Email delivery     |

Namecheap (the registrar for `treelot-preview.site`) quirks:
- Host field = prefix only (e.g. `clerk`, NOT `clerk.<your-domain>`).
  Namecheap auto-appends the domain.
- Value field = no trailing dot.
- DKIM hosts contain underscores — Namecheap's Advanced DNS allows them, but
  some other DNS UIs reject them.

After saving, click **Verify** in Clerk for each record. Then wait 2–10 min
for Clerk to provision Let's Encrypt SSL certs for `clerk.<your-domain>`
and `accounts.<your-domain>`.

**Verification.**
```bash
# Each subdomain should return a CNAME:
for host in accounts clerk clk._domainkey clk2._domainkey clkmail; do
  echo "$host.<your-domain>: $(dig @8.8.8.8 +short CNAME $host.<your-domain>)"
done

# Once Clerk provisions SSL, this returns HTTP/2 307 (not empty):
curl -sI https://clerk.<your-domain>/npm/@clerk/clerk-js@6/dist/clerk.browser.js
```

### 11.4 Stale NXDOMAIN cache blocks the satellite domain

**Symptom.** All five CNAMEs are added and verified by Clerk. SSL certs are
active. `dig @8.8.8.8 +short clerk.<domain>` returns the CNAME chain. But
the sign-in page is still blank in your browser, even after hard refresh and
incognito mode.

**Root cause.** Before you added the CNAMEs, anything resolving
`clerk.<domain>` got NXDOMAIN. DNS resolvers cache negative responses for up
to the SOA's `negative TTL` (often 1 hour+). Layers that may hold the stale
cache: macOS resolver, Chrome's internal DNS cache, your home router, your
ISP's recursive resolver. **Incognito mode bypasses cookies and storage,
not OS or network DNS caches.**

**Fix.** Bypass every cache layer at once by switching the Mac to public DNS:

1. **System Settings → Network → [active connection] → Details → DNS tab**
2. Add `1.1.1.1` and `8.8.8.8` to DNS Servers
3. Apply
4. Flush local OS cache:
   ```bash
   sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
   ```
5. Chrome internal flush: visit `chrome://net-internals/#dns` → "Clear host
   cache", then `chrome://net-internals/#sockets` → "Flush socket pools"
6. Quit Chrome fully (Cmd-Q), reopen, retry the sign-in page

Negative DNS TTLs eventually expire (usually within an hour), so this
resolves on its own with patience. Switching to `1.1.1.1` / `8.8.8.8` is
faster and has no downside — those resolvers are also faster than most ISP
defaults; you can leave them in place permanently.

**Verification.**
```bash
# Before fix (system resolver returns nothing):
dig +short clerk.<your-domain>

# After fix (system resolver returns the CNAME chain):
dig +short clerk.<your-domain>
# frontend-api.clerk.services.
# worker.clerkprod-cloudflare.net.
# 104.18.34.146

# In the browser DevTools console:
typeof window.Clerk   # "object" (not "undefined")
```

### 11.5 Clerk production needs your own Google OAuth credentials

**Symptom.** Sign-in page works. Clicking "Sign in with Google" shows:

> Access blocked: Authorization Error
> Missing required parameter: client_id
> Error 400: invalid_request

**Root cause.** Dev Clerk instances use Clerk's **shared dev OAuth app** for
Google sign-in — works without configuration. Google's policy disallows this
in production, so Clerk ships prod instances with Google enabled but Client
ID/Secret blank, expecting you to provide them.

**Fix.**

1. **Get the redirect URI from Clerk.** Clerk dashboard → Production →
   **SSO Connections** → Google → toggle "Use custom credentials". Copy the
   **Authorized redirect URI** (e.g. `https://clerk.<your-domain>/v1/oauth_callback`).

2. **Set up Google OAuth credentials** at https://console.cloud.google.com:
   - Create or select a project (e.g. `treelot-prod`)
   - Left sidebar → **Google Auth Platform** (formerly "OAuth consent screen")
     - Click **Get Started**
     - **App Information:** name = `TreeLot`, support email = your email
     - **Audience:** External
     - **Contact info:** your email
     - Agree → Create
   - Under Google Auth Platform → **Audience** → if status is "Testing",
     click **PUBLISH APP** (otherwise only listed test users can sign in)
   - Under Google Auth Platform → **Clients** → **+ CREATE CLIENT**
     - Application type: **Web application**
     - Name: `TreeLot Production`
     - Authorized redirect URIs: paste the URI from step 1
   - Click CREATE → copy the **Client ID** and **Client Secret**

3. **Paste into Clerk.** Back at the Clerk Google connection page → enter
   Client ID + Client Secret → Save.

The only way to avoid this gotcha entirely is to disable Google sign-in on
the prod instance (email/password only).

**Verification.**
```
Visit https://<your-domain>/sign-in → click "Sign in with Google"
→ should see Google's normal account picker (not the 400 error)
```

### 11.6 First prod login lands at `/onboarding` (no DB row yet)

**Symptom.** You sign in to prod for the first time. The app redirects you
to `/onboarding` and asks you to create an org, even though you're "the
admin."

**Root cause.** `app/(dashboard)/layout.tsx` looks up your `clerkId` in the
prod `users` table. Prod is fresh → no row → `dbUser` is null → redirect to
onboarding. Same behavior any new user would see.

**Fix — pick one.**

**Option A (legit user flow):** go through onboarding to create your first
prod org. Use this if you want a clean prod history that mirrors what real
users will do.

**Option B (manual bootstrap):** INSERT an owner row directly into prod
linking your prod Clerk ID to whatever org you want. Use this if you want
to skip onboarding for testing.

For Option B, get your prod Clerk user ID via the Clerk API (uses your prod
`CLERK_SECRET_KEY`):

```bash
curl -s "https://api.clerk.com/v1/users?email_address=<your-email>" \
  -H "Authorization: Bearer $CLERK_SECRET_KEY" \
  | jq '.[] | {id, email_addresses}'
```

Then INSERT (replace placeholders):

```sql
INSERT INTO users (id, "clerkId", "orgId", "locationId", role, name, email, "createdAt")
VALUES (
  gen_random_uuid(),
  '<your-clerk-user-id>',
  '<existing-org-uuid>',
  '<existing-location-uuid>',
  'owner',
  '<your-name>',
  '<your-email>',
  NOW()
);
```

**Verification.** Reload `/pos` — should land on the dashboard, not redirect
to `/onboarding`.

---

## Diagnostic command cheat sheet

Safe / read-only commands for debugging prod issues.

```bash
# DNS — does my system resolver agree with the world?
dig +short <hostname>                          # system resolver
dig @8.8.8.8 +short <hostname>                 # Google DNS
dig @1.1.1.1 +short <hostname>                 # Cloudflare DNS

# Check whether a Supabase endpoint is IPv4-reachable
dig +short A <hostname>      # IPv4 records
dig +short AAAA <hostname>   # IPv6 records

# Test an HTTPS endpoint without trusting your local DNS
IP=$(dig @8.8.8.8 +short <hostname> | grep -E '^[0-9]' | head -1)
curl -sI --resolve "<hostname>:443:$IP" "https://<hostname>/<path>"

# Confirm Clerk satellite is provisioned + reachable
curl -sI https://clerk.<your-domain>/npm/@clerk/clerk-js@6/dist/clerk.browser.js
# Healthy: HTTP/2 307 with Cloudflare headers
# Unhealthy: empty (DNS fails) or HTML error page (Clerk not provisioned)

# Verify the live Vercel deployment serves the right Clerk publishable key
curl -s https://<your-domain>/sign-in | grep -o 'data-clerk-publishable-key="[^"]*"'

# Check which build is live
curl -s https://<your-domain>/api/health
# {"ok":true,"version":"<7-char-sha>"}

# Look up a Clerk user ID by email (uses your CLERK_SECRET_KEY)
curl -s "https://api.clerk.com/v1/users?email_address=<email>" \
  -H "Authorization: Bearer $CLERK_SECRET_KEY"

# Check prod migration status (inline env vars — won't pollute .env.local)
DATABASE_URL="<prod-pooler>" DIRECT_URL="<prod-session-pooler>" npx prisma migrate status

# Flush macOS DNS cache (harmless)
sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
```
