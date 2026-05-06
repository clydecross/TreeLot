# TreeLot Security Findings — 2026-05-04

**Scope:** Full audit of `app/`, `server/`, `lib/`, `prisma/`, `proxy.ts`,
`next.config.ts`, `instrumentation*.ts`, `sentry.*.config.ts`, `scripts/`,
`.env.local.example`, `.gitignore`, deploy runbook, and git history (secret
sweep).
**Auditor:** principal security architect (this session)
**Engagement model:** embedded review + threat-model gate (confirmed
2026-05-04). This document is the "cycle 0" baseline. Every finding has
severity, file:line, what's wrong, why it matters, and a concrete fix.

---

## Triage table — fix in this order

| # | Severity | File | Title | Fix this… |
|---|---|---|---|---|
| 1 | ~~**Critical**~~ ✅ | `server/trpc.ts:52–61` + `app/(dashboard)/layout.tsx:36–50` | Cross-org impersonation via forgeable cookies | ~~Today~~ — closed `ae6478b` (2026-05-04) |
| 2 | ~~**High**~~ ✅ | `server/routers/drivers.ts:57–118` | Driver PIN brute-forceable in ~15–20 min | ~~This week~~ — closed 2026-05-05 (lockout + IP rate limit + audit log; PIN length still pending decision) |
| 3 | **High** | `app/demo/route.ts` + `server/trpc.ts:40–46` | `/demo` grants writable owner access to demo org | **This week** — blocked on disposition decision (A/B) |
| 4 | **High** | `sentry.*.config.ts` + `app/PostHogProvider.tsx` | Customer PII forwarded to Sentry & PostHog with no redaction | **This week** |
| 5 | ~~**High**~~ ✅ | `scripts/set-driver-pin.ts` (committed) | Committed dev script sets PIN `1234` on a fixed UUID | ~~This week~~ — closed 2026-05-05 (rewritten to require CLI args, refuse prod) |
| 6 | Medium | `server/routers/tax.ts:27` | `tax.lookupRate` is unauthenticated (publicProcedure) — quota-drain abuse | This sprint |
| 7 | ~~Medium~~ ✅ | `server/routers/drivers.ts:39–51` | `drivers.getList` enumerates driver names per location | ~~This sprint~~ — IP rate limit + audit log added 2026-05-05 (per-lot device token still optional hardening) |
| 8 | Medium | `lib/driver-session.ts` | No per-driver session revocation; rotated PIN doesn't kill old token | This sprint |
| 9 | Medium | `next.config.ts` (no `headers()`) | Zero security headers — no CSP, HSTS, frame-options, referrer-policy, etc. | This sprint |
| 10 | Medium | `server/router.ts` (no audit log model) | No audit trail for destructive admin actions | This sprint — auth-surface slice landed 2026-05-05; admin slice still open |
| 11 | Medium | `server/routers/admin.ts:181–262` | Invitations never auto-expire | Backlog |
| 12 | Medium | `app/(superadmin)/orgActions.ts` | Server actions rely on framework CSRF — verify still on in Next 16 | Backlog |
| 13 | ~~Medium~~ ✅ | `server/routers/drivers.ts` | No PIN lockout after N failed attempts | ~~Backlog~~ — closed 2026-05-05 with H-1 (5 fails → 15min lockout) |
| 14 | Low | `server/trpc.ts:78–86` | tRPC error formatter exposes Zod field shapes | Backlog |
| 15 | Low | `app/api/health/route.ts:7` | `/api/health` exposes commit SHA to anonymous callers | Backlog |
| 16 | Low | `server/routers/shift.ts:14, 22` | Throws raw `Error` instead of `TRPCError` | Backlog |
| 17 | Low | `package.json` | Dependencies use caret ranges; no Dependabot/Renovate | Backlog |
| 18 | Info | `server/routers/customers.ts:108` | `ILIKE` with unescaped `%`/`_` — not security, but worth knowing | Backlog |
| 19 | Info | `server/routers/admin.ts:231` | `NEXT_PUBLIC_APP_URL` falls back to `localhost:3002` if unset | Backlog |
| 20 | Info | RLS off (Decision 1) | Tenant isolation entirely on tRPC middleware — keep audit cadence high | Standing |

What I verified is **clean**:

- Secrets are not in git history (checked `.env`, `.env.local`, `sk_live_`, `sk_test_`, `CLERK_SECRET`, `DATABASE_URL`, `TAXJAR_API_KEY`, `DRIVER_SESSION_SECRET` via pickaxe).
- `.gitignore` covers `.env`, `.env.local`, `node_modules`, `.next`, `lib/generated`. ✓
- `dangerouslySetInnerHTML` appears once in `app/layout.tsx` for the theme-boot script — content is a hardcoded string, no user input. ✓
- All raw SQL (`$queryRaw`) is parameterized via Prisma tagged-template; the one dynamic fragment in `customers.list` is built from a `z.enum` allowlist and wrapped in `Prisma.sql`. **No SQL injection.** ✓
- Money is in cents (integers). Tax computed server-side from `org.taxRateBps`, never from client input. ✓
- Cross-org checks are present on every staff/manager/owner mutation I read (customers, purchases, deliveries, admin, users). The middleware pattern is working — it's the *exceptions* below that broke it.

---

## Critical findings

### C-1. Cross-org impersonation via forgeable `superadmin_*` cookies

**Files:** `server/trpc.ts:52–61`, `app/(dashboard)/layout.tsx:36–50`
**Severity: Critical** — full multi-tenant bypass.

**What's wrong.** The "view as another lot" feature reads two cookies:
`superadmin_org` (the target org's UUID) and `superadmin_clerk_id` (a Clerk
user id). It accepts the impersonation if `superadmin_clerk_id` equals the
requester's actual Clerk session id. Both cookies are user-set, so any
signed-in user can:

1. Inspect their own Clerk id (it's exposed in any authenticated client
   call).
2. Set both cookies on their own browser: `superadmin_org=<any-org-uuid>`,
   `superadmin_clerk_id=<their-own-id>`.
3. Reload the dashboard. They're now rendered as the owner of that org
   (`role` is hardcoded to `'owner'` at `trpc.ts:60`), and every tRPC call
   they make is scoped to that org.

The cookie set in `app/(superadmin)/admin/view/[orgId]/route.ts:5–30` does
the *real* admin email check — but the consumers in `trpc.ts` and
`layout.tsx` re-derive trust from the cookie alone, so they treat
self-set cookies as legitimate.

**Why it matters.** Any signed-in user — including a freshly-signed-up
prospect on the marketing site — can read, edit, and delete customers,
purchases, deliveries, invitations, locations, and users in *any* other
tree lot's org. Plain English: a guard in the bank vault sees a sticky
note that says "I'm the owner" and unlocks the door.

**Fix.** Re-run the `ADMIN_EMAIL` check on every request that consumes the
`superadmin_*` cookie, not just at the moment the cookie is set. Concrete
shape:

```ts
// In server/trpc.ts createContext, BEFORE trusting the cookie:
const demoOrgId   = cookieStore.get('superadmin_org')?.value;
const demoClerkId = cookieStore.get('superadmin_clerk_id')?.value;

if (demoOrgId && demoClerkId && demoClerkId === clerkId) {
  // Re-verify the requester is the actual super-admin RIGHT NOW.
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  const client     = await clerkClient();
  const clerkUser  = await client.users.getUser(clerkId);
  const primary    = clerkUser.emailAddresses
    .find(e => e.id === clerkUser.primaryEmailAddressId)
    ?.emailAddress?.toLowerCase();
  if (adminEmail && primary === adminEmail) {
    // OK to impersonate.
    const orgUser = await prisma.user.findFirst({
      where: { orgId: demoOrgId },
      select: { /* ... */ },
    });
    if (orgUser) user = { ...orgUser, role: 'owner' };
  }
}
```

Apply the same fix in `app/(dashboard)/layout.tsx` lines 36–50. Better
yet, factor the gate into one helper (`assertSuperAdminAndImpersonate`)
so neither call site can get it wrong again.

**Belt-and-suspenders.** Sign the cookie (HMAC over `orgId|clerkId|exp`)
the same way `lib/driver-session.ts` signs driver sessions, so the cookie
itself is tamper-evident. This is independent of the email re-check above
— do both.

**How to verify the fix.** With your normal (non-admin) Clerk session,
open dev tools, set `superadmin_org=<any uuid>` and
`superadmin_clerk_id=<your clerk id>`, hit `/pos`. Before the fix you see
that org's data. After the fix you should be redirected/blocked.

---

## High findings

### H-1. Driver PIN brute-forceable in 15–20 minutes per driver

**File:** `server/routers/drivers.ts:57–118` (and the public-procedure
declaration at line 57).
**Severity: High** — realistic attack with low skill ceiling.

**What's wrong.** `drivers.authenticate` is a public procedure that
accepts `{ userId, pin, locationId }`. PIN is 4 digits (10,000 keys),
verified with `bcrypt.compare`. There's no rate limit, no per-account
lockout, no captcha, and no IP-based throttle. `drivers.getList` (also
public, lines 39–51) enumerates every driver/staff member's name and id
for any given `locationId`.

**Why it matters.** An attacker with one valid `locationId` (which you
print on QR codes for the lot tablet — hardly secret) can:

1. Call `drivers.getList` to enumerate driver UUIDs.
2. For each driver UUID, send 10,000 `authenticate` mutations spanning
   the PIN keyspace. bcrypt(10) verifies in ~80–120 ms; with parallel
   requests, the attacker gets through one driver in 15–20 minutes.
3. On success, they hold a valid driver session — full access to that
   day's stops with customer names, addresses, and phone numbers, plus
   the ability to mark deliveries delivered/failed.

**Fix.** Three layers, in priority order:

1. **Account lockout.** After 5 failed attempts on the same `(userId)`,
   refuse `authenticate` for that user for 15 minutes. Track this in a
   small table — `pin_failures (userId, count, lockedUntil)` — or in
   Upstash if you'd rather not add schema. Reset on successful login.
2. **IP-bucket rate limit.** No more than 30 `authenticate` calls per
   IP per minute. Upstash Ratelimit + Vercel KV is the path-of-least-
   resistance here; ~50 lines.
3. **Lengthen the PIN.** 6 digits = 1,000,000 keys = ~24 hours per
   driver to brute force, and a working lockout makes that infeasible.
   Optional but recommended — your friend's drivers will not notice the
   difference.

**Belt-and-suspenders.** Audit-log every successful and failed PIN auth
(`who, when, ip, ok=true|false`). Also: harden `drivers.getList` to
require *something* (a per-lot device token printed by the manager) so
driver-name enumeration isn't free.

---

### H-2. `/demo` grants writable owner access to the demo org

**Files:** `app/demo/route.ts`, `server/trpc.ts:40–46`,
`app/(dashboard)/layout.tsx:13–33`, `server/routers/analytics.ts:565–567`.
**Severity: High** — defacement / abuse vector, not data exfiltration
(demo data is synthetic per `scripts/seed-demo.ts`).

**What's wrong.** Any visitor who hits `/demo` gets `demo_mode=1` set
HttpOnly. From that point on, `createContext` returns the *first user* of
`DEMO_ORG_ID` with role hardcoded to `'owner'`, so every tRPC call —
including mutations — runs as that owner. They can `customers.create`,
`customers.update`, `purchases.create`, `deliveries.assignDriver`,
`admin.deleteLocation` (!), `admin.removeUser` (!), etc.

**Why it matters.** A motivated visitor can:

- Delete every customer and purchase in your demo before your next
  prospect demo. Re-seed turns into a manual ritual.
- Insert obscene customer names so the next prospect sees them.
- Spam-create thousands of customers/purchases to break the dashboard
  charts.
- Send `admin.inviteUser` to invite their own email as an owner of the
  demo org. (They'd then need a Clerk account, but Clerk's sign-up is
  open.)

The same bug *also* re-renders `(dashboard)/layout.tsx` as the demo
owner without ever calling Clerk, so the dashboard chrome treats them
as authenticated.

**Fix.** Two options:

- **Option A (recommended): demo is read-only.** Add a
  `demoMode: boolean` to `Context`, set it true when the cookie is
  present, and add a `notInDemoMode` middleware that throws on every
  mutation. Apply to all `*.create / *.update / *.delete /
  *.set* / *.assign* / *.report*` procedures. Keeps the demo flow
  intact for prospects but eliminates the abuse path.
- **Option B: scope the demo to a per-visitor sandbox.** On first hit,
  fork the demo org into a temp org with a random UUID stored in the
  cookie; route the user there. More work, but lets prospects "play"
  without colliding with each other. Probably overkill until prospect
  volume justifies it.

**Belt-and-suspenders regardless of A or B.** Add a Vercel Edge
Middleware rate limit on `/demo` (100/IP/day) so a botnet can't burn
your DB and Sentry quota.

---

### H-3. Customer PII forwarded to Sentry & PostHog with no redaction

**Files:** `sentry.client.config.ts`, `sentry.server.config.ts`,
`sentry.edge.config.ts`, `app/PostHogProvider.tsx`.
**Severity: High** — privacy / compliance exposure.

**What's wrong.** Sentry's default capture payload includes request
URL+query, request body (when available), the user's IP (via the SDK's
default `sendDefaultPii: true` heuristic in newer versions), and
exception messages. None of the three Sentry configs set
`beforeSend`/`beforeBreadcrumb` to scrub PII. Same with PostHog —
`PostHogProvider` calls `posthog.identify(user.id, { email, name })` on
every signed-in user, and `capture_pageleave: true` plus default
autocapture means every form interaction (customer name, phone, email,
address as the staff types them at the POS) ships to PostHog Cloud.

**Why it matters.** Customer phone numbers, emails, addresses, and order
notes will end up in third-party SaaS dashboards. Once a customer's data
is in Sentry/PostHog Cloud:

- It's in their backups (~30 days for Sentry, configurable for
  PostHog).
- It's accessible to anyone on your Sentry/PostHog org (a future
  contractor, etc.).
- You'd need to issue cross-vendor deletion requests to honor a CCPA/
  state-privacy "delete my data" request.
- Anyone who discovers a typo'd email or PII in an error message can
  read it from the Sentry issue page.

**Fix.**

1. Add `beforeSend` and `beforeBreadcrumb` to all three Sentry configs:

   ```ts
   Sentry.init({
     dsn,
     sendDefaultPii: false,
     beforeSend(event) {
       if (event.request?.data) event.request.data = '[redacted]';
       if (event.request?.cookies) event.request.cookies = '[redacted]';
       if (event.user) event.user = { id: event.user.id }; // strip email/ip
       return event;
     },
     beforeBreadcrumb(crumb) {
       if (crumb.category === 'fetch' || crumb.category === 'xhr') {
         delete crumb.data?.input;
         delete crumb.data?.body;
       }
       return crumb;
     },
   });
   ```

2. PostHog: drop `email` and `name` from `identify` (use Clerk id
   only). Disable autocapture for sensitive screens with `data-ph-no-
   capture` on customer-input forms. Or set
   `autocapture: false` globally and add named events where you
   actually want analytics. Set `mask_all_text: true` for session
   recordings if you ever enable them.

3. Add a one-line check in `lib/db.ts` — wrap `prisma` with a logger
   middleware that strips bound parameters before Sentry breadcrumbs
   are taken.

**Belt-and-suspenders.** Add a privacy policy page that lists the third
parties you forward data to (Clerk, Sentry, PostHog, TaxJar, Supabase) —
this is required for CCPA and most state laws.

---

### H-4. Committed dev script sets PIN `1234` on a fixed user UUID

**File:** `scripts/set-driver-pin.ts` (lines 5–6).
**Severity: High** — supply-chain / credential exposure.

**What's wrong.** This script is checked into git with a hardcoded
`TEST_USER_ID = '877ddf10-efd5-4dcd-9ce5-a8c7de3c7044'` (the same UUID
the seed script uses at `scripts/seed-demo.ts:21`) and a hardcoded
`PIN = '1234'`. If anyone runs `npx tsx scripts/set-driver-pin.ts` with
the production `DATABASE_URL` set, the production user with that UUID
will have PIN `1234`. Anyone with read access to the repo also knows
that *this UUID was at some point assigned PIN `1234`* — meaning if you
seeded prod with this UUID and never rotated, it's a backdoor.

**Why it matters.** Combined with the brute-force gap (H-1), this isn't
even a brute-force — it's a known credential. And `1234` is the most-
guessed PIN in the world, so even without git access an attacker would
guess it within minutes via H-1's vector.

**Fix.**

1. Verify what's in production today: hit the prod DB and check the PIN
   hash on user `877ddf10-…`. If it bcrypts against `1234`, rotate it
   immediately.
2. Rewrite the script to take the user UUID and PIN as CLI args (no
   defaults) and exit if env is `production`:

   ```ts
   if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
     console.error('Refusing to run in production.');
     process.exit(1);
   }
   const userId = process.argv[2];
   const pin    = process.argv[3];
   if (!userId || !/^\d{4,8}$/.test(pin ?? '')) {
     console.error('Usage: tsx scripts/set-driver-pin.ts <userId> <pin>');
     process.exit(1);
   }
   ```

3. Also: remove `877ddf10-…` and `1234` from git history if you ever
   plan to make this repo public. (Not urgent for a private repo, but
   noting it.)

---

## Medium findings

### M-1. `tax.lookupRate` is unauthenticated — quota-drain

**File:** `server/routers/tax.ts:27` (publicProcedure).
**Severity: Medium.**

**What's wrong.** The TaxJar lookup is `publicProcedure` (the comment
says "abuse risk is low because /onboarding requires Clerk session" —
but the tRPC endpoint itself, `/api/trpc/tax.lookupRate`, is in
`isPublicRoute` per `proxy.ts:9`, so anyone on the internet can call it
without a Clerk session). Each call burns 1 of your 10,000/month TaxJar
credits.

**Why it matters.** A bored attacker drains your monthly quota in one
afternoon (`for i in {00000..99999}; do curl …`). Onboarding then fails
to auto-fill tax rates for real customers. Mild availability hit, but
also a financial vector if you upgrade to a metered plan.

**Fix.** Move to `protectedProcedure` (requires authenticated Clerk
session — abuse cap is "an attacker has to first sign up to TreeLot,
which Clerk gates"). Add a per-user rate limit (10/min) on top.

---

### M-2. `drivers.getList` enumerates driver names

**File:** `server/routers/drivers.ts:39–51`.
**Severity: Medium.**

**What's wrong.** Public endpoint that takes a `locationId` and returns
`{ id, name }` for every driver/staff at that location. `assertLocation`
only checks the location exists.

**Why it matters.** With a `locationId` (printed on the lot tablet QR
code, sometimes shared with friends or shown in marketing), an attacker
gets a list of staff names — useful for phishing ("Hi, I'm calling for
[name] about a delivery") and for chaining into the PIN brute-force in
H-1.

**Fix.** Two options:

- **Option A:** keep the endpoint but require a per-lot device token
  (managers print this on the tablet during setup, stored in
  `localStorage`). Hash-compare server-side.
- **Option B:** keep the endpoint but require the requester to first
  pass a device-fingerprint challenge (e.g., a manager scans a QR that
  sets a long-lived `device_id` cookie; getList rejects requests
  without it).

A is simpler. B is cleaner ergonomically.

---

### M-3. Driver session has no per-driver revocation

**File:** `lib/driver-session.ts`.
**Severity: Medium.**

**What's wrong.** `signDriverSession` returns an HMAC-signed token with
12h TTL. Verification only checks the HMAC and expiry — there's no
revocation list, no token version. So:

- If a driver is fired (`admin.removeUser`) at 9am, their existing
  signed token still works until 9pm.
- If `drivers.changePin` is called, the old token (which an attacker
  might also have, e.g., from a phished session) keeps working.
- If `DRIVER_SESSION_SECRET` is rotated, *all* driver sessions die at
  once (no per-driver granularity).

**Why it matters.** Standard offboarding-can't-revoke-fast issue.
Bounded by the 12h TTL but still a 12-hour window for a fired driver
or a compromised session.

**Fix.** Add a `pinVersion` (or `sessionVersion`) integer column on
`User`. Embed it in the signed token. Bump it on `setUserPin`,
`changePin`, `removeUser`, manager-initiated revoke. `verifyDriverSession`
fails if `tokenVersion !== currentVersion`. Cost: one extra round-trip
per driver request — fine for the request volume.

---

### M-4. No security headers (CSP, HSTS, etc.)

**File:** `next.config.ts` (no `headers()` block).
**Severity: Medium.**

**What's wrong.** `poweredByHeader: false` is the only hardening.
Missing: `Content-Security-Policy`, `Strict-Transport-Security`,
`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
`X-Frame-Options` (or CSP `frame-ancestors`). Vercel's edge defaults
add some, but not all.

**Why it matters.**

- No HSTS = first-time visitors are HTTPS-stripping vulnerable on
  hostile networks.
- No CSP = if any XSS sink leaks in (you have one
  `dangerouslySetInnerHTML` for theme bootstrap, plus future user-
  generated content like delivery notes), the blast radius is
  unbounded.
- No `frame-ancestors` = your dashboard can be iframed by a
  clickjacking attacker (bait the manager into clicking "Delete org").
- No `Referrer-Policy` = the next-clicked outbound link gets your full
  URL (potentially with org/customer IDs).

**Fix.** Add to `next.config.ts`:

```ts
async headers() {
  return [
    {
      source: '/:path*',
      headers: [
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'X-Content-Type-Options',    value: 'nosniff' },
        { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=(self)' },
        { key: 'X-Frame-Options',           value: 'DENY' },
        // CSP: ship in Report-Only first to find legitimate violations from
        // Clerk, PostHog, Sentry, then promote to enforcing. Skeleton:
        {
          key: 'Content-Security-Policy-Report-Only',
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://*.clerk.com",
            "img-src 'self' data: https://img.clerk.com https://*.clerk.accounts.dev",
            "connect-src 'self' https://*.clerk.com https://*.clerk.accounts.dev https://*.posthog.com https://*.sentry.io",
            "frame-ancestors 'none'",
          ].join('; '),
        },
      ],
    },
  ];
}
```

Run a week in `Report-Only`, watch your Sentry/CSP report endpoint,
then promote to enforcing. The Clerk/PostHog/Sentry origins will need
tuning — your actual list shows up in violation reports.

---

### M-5. No audit log for sensitive actions

**File:** entire `server/routers/` (no audit-log model in
`prisma/schema.prisma`).
**Severity: Medium** — incident-response gap.

**What's wrong.** There's no append-only record of:

- Who deleted an org (`(superadmin)/orgActions.ts:deleteOrg`)
- Who removed a user, demoted a role, set/reset a PIN
- Who invited / revoked an invitation
- Who logged in successfully or failed PIN auth
- Who hit the `/admin/view/[orgId]` impersonation handler

**Why it matters.** When a tree lot calls and says "someone deleted my
50 customers!" you have no way to answer "who." Architect prefs already
flagged this as Decision #7 ("audit logging strategy") pending — this
is the security-driven version of the same need.

**Fix.** New Prisma model:

```prisma
model AuditLog {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId      String?  @db.Uuid       // null for super-admin actions
  actorId    String?  @db.Uuid       // null for unauthenticated events (PIN auth fail)
  actorEmail String?
  ip         String?
  action     String                  // "user.delete", "delivery.markDelivered", etc.
  targetType String                  // "User", "Customer", "Delivery", ...
  targetId   String?
  metadata   Json?                   // before/after diff for updates
  createdAt  DateTime @default(now()) @db.Timestamptz

  @@index([orgId, createdAt(sort: Desc)])
  @@index([actorId, createdAt(sort: Desc)])
  @@map("audit_logs")
}
```

Wrap critical mutations with a tiny helper (`logAudit({ ctx, action,
targetType, targetId, metadata })`) and call it inside the same
transaction as the mutation. Standing rule for the threat-model gate:
every new admin/destructive procedure ships with an audit-log call.

---

### M-6. Invitations never auto-expire

**File:** `server/routers/admin.ts:181–262`.
**Severity: Medium.**

**What's wrong.** `Invitation.status` has an `expired` enum value but
no code path sets it. A manager invites `joe@example.com` in November.
A year later, an attacker who acquires `joe@example.com` (domain expired
and re-registered, or email account compromised) signs up to TreeLot
with that address — `users.bootstrap` finds the still-pending invitation
and auto-joins them to the org with the original role.

**Why it matters.** Long-lived invitations = long-lived attack window.
Email-based identity can be re-acquired by attackers in many ways
(domain expiry, mailbox takeover via parent account compromise).

**Fix.** In `admin.inviteUser`, store an `expiresAt` (e.g., `now + 14
days`). In `users.bootstrap`, filter invitation lookup by
`expiresAt: { gt: new Date() }`. Optionally add a daily cron (or a
per-request lazy sweep) that flips stale invitations to `expired`.

---

### M-7. Server actions — verify Next.js 16 same-origin gate

**File:** `app/(superadmin)/orgActions.ts`.
**Severity: Medium pending verification.**

**What's wrong.** `updateOrg` and `deleteOrg` are `'use server'` actions
called from the client. Next.js 14+ enforces same-origin checks on
server actions by default to prevent cross-site request forgery. Your
project notes warn: *"This is NOT the Next.js you know. Read
`node_modules/next/dist/docs/` before writing any code"* (from
`AGENTS.md`). I have not opened that doc to verify the behavior in 16.

**Why it matters.** If the same-origin gate is *off* by default in your
fork of Next 16 (or weakened), an attacker could host a page on
`evil.com` that issues a `fetch('https://treelot.example.com/admin',
{ method: 'POST', credentials: 'include' })` and triggers `deleteOrg`.

**Fix.** Confirm in `node_modules/next/dist/docs/` that server-action
CSRF protection is enabled for this version. If it isn't, switch
`updateOrg` and `deleteOrg` to tRPC mutations behind
`superadminProcedure` instead of server actions — that puts them on the
same auth path you've already hardened.

I can verify this for you in a follow-up step (need to read the actual
docs in `node_modules`); flagging as Medium-pending.

---

### M-8. No PIN lockout after N failed attempts

Already covered in **H-1** above. Listed separately because it deserves
its own line in the triage table — even if the rate limit lands, a per-
account lockout is the simpler defensive layer and should ship first.

---

## Low findings

### L-1. tRPC error formatter exposes Zod field shapes

**File:** `server/trpc.ts:78–86`.
**What's wrong.** `errorFormatter` always includes `zodError.flatten()`
in the response shape. For unauthenticated callers, this leaks input-
schema details (which fields exist, which are required).
**Fix.** Only include `zodError` when `process.env.NODE_ENV !== 'production'`,
or when the request was authenticated. This is a tiny info-disclosure
hardening.

### L-2. `/api/health` exposes commit SHA

**File:** `app/api/health/route.ts:7`.
**What's wrong.** Returns `version: <7-char-sha>` to anonymous callers.
Helpful for ops, also helpful for attackers correlating CVEs to your
exact commit.
**Fix.** Drop `version` from the public response; keep a separate
authenticated `/api/health/internal` endpoint that has it.

### L-3. `shift.summary` throws raw `Error` not `TRPCError`

**File:** `server/routers/shift.ts:14, 22`.
**What's wrong.** Two `throw new Error(...)` calls. tRPC's default
serialization for non-`TRPCError` exceptions exposes more than necessary
(internal stack frames in dev, generic message in prod, but with a
wider serialization path).
**Fix.** Replace with `throw new TRPCError({ code: 'PRECONDITION_FAILED'
| 'NOT_FOUND', message })`.

### L-4. Caret-ranged dependencies; no Dependabot/Renovate

**File:** `package.json`.
**What's wrong.** All deps use `^` ranges. `npm install` on a fresh
machine can pull in newly-published patch versions you've never tested.
No automated dependency-update PRs.
**Fix.** Two complementary moves:
1. Keep `^` in `package.json` but commit `package-lock.json` (already
   done) and rely on `npm ci` in CI/Vercel for reproducibility.
2. Add Dependabot (free with GitHub) or Renovate. Weekly schedule for
   dev deps, immediate for security advisories.

---

## Info findings (worth knowing, not worth fixing yet)

### I-1. `customers.search` `ILIKE` doesn't escape `%`/`_`

**File:** `server/routers/customers.ts:108`.
**What's happening.** `likeParam = '%${trimmed}%'`. If a user types `%`
or `_`, the SQL pattern interpretation is "match anything" and "match
one char" respectively. Not security (the query is parameterized and
org-scoped), but a perf/UX foot-gun: a query of just `%` returns the
first 10 customers org-wide.
**Fix when you touch this code.** Escape with
`trimmed.replace(/[\\%_]/g, '\\$&')` and use `ILIKE … ESCAPE '\\'`.

### I-2. `NEXT_PUBLIC_APP_URL` falls back to `localhost:3002`

**File:** `server/routers/admin.ts:231`.
**What's happening.** If the env var isn't set in production,
invitation redirect URLs link to `http://localhost:3002/onboarding`.
Operational hazard, not a security one — but invited teammates click a
broken link and the operator doesn't notice until someone calls.
**Fix.** Throw at startup if `NEXT_PUBLIC_APP_URL` is unset and
`NODE_ENV === 'production'`.

### I-3. `lib/generated/prisma/` in repo

**File:** `lib/generated/prisma/...`
**What's happening.** Output of `prisma generate`, regenerated by
postinstall. Not a security issue per se, but it's noise in code
review and grep results.
**Fix.** Already in `.gitignore` — confirm it's ignored. ✓ (Verified.)

---

## Standing program — what "embedded" means going forward

Beyond fixing the findings above, the role has four standing
mechanisms. Each is intentionally lightweight so it doesn't slow you
down at solo-dev pace.

### 1. Threat-model gate (5-discipline pass before each feature ships)

For every PR / feature that adds a new boundary, before merging answer
the 10-question checklist from BridgeSecurity:

1. Trust boundaries crossed?
2. AuthN + AuthZ checked at the right granularity (role *and*
   ownership)?
3. Input validated by schema before any side effect?
4. Output encoded for the destination context (HTML / SQL / shell /
   log / URL)?
5. Secrets in env/vault, not in code/logs/client/error responses?
6. Failure mode = deny?
7. Blast radius if owned?
8. Supply chain: deps pinned and audited?
9. Audit log line for security events?
10. Replay protection (idempotency / nonce / rate limit) where
    appropriate?

I'll run this myself when I review changes; you can also just send me
"reviewing PR #N — anything to flag?" and I'll do it.

### 2. Quarterly fresh audit

Re-run a baseline like this document every 3 months. Drift is real;
auth surfaces grow; new third-party integrations get added. Quarterly
cadence catches it before it ages into a fire.

### 3. Incident-response runbook (write once, store with DEPLOY.md)

When something does go wrong (lost PIN, compromised cookie, leaked
secret, customer data request), the runbook says: who to notify, how
to rotate, how to query the audit log, how to back up before
remediation. I can draft this in a follow-up — flag it when you're
ready.

### 4. Open questions I'd like you to answer

These are decisions only you can make:

- **Demo-mode disposition:** read-only (Option A in H-2) or per-visitor
  sandbox (Option B)? My recommendation is A.
- **PIN length:** keep 4 digits + lockout, or move to 6 digits +
  lockout? I'd push for 6.
- **Audit log retention:** how long do you want audit rows to live? My
  default is 2 years.
- **Bug bounty / vuln disclosure:** at MVP scale, do you want a
  `security.txt` and a `security@treelot.app` mailbox? Cheap to add
  before launch.
- **PII data residency:** Supabase, Clerk, Sentry, PostHog, Vercel —
  do any customers have data-residency requirements? (Probably not for
  US-only tree lots, but worth confirming before SOC 2 conversations
  start.)

---

## Suggested next session

Pick one of these as the next 30–60 minute block:

- **A.** I write the actual fixes for findings #1–#5 (Critical + High)
  as small PRs, you review and merge.
- **B.** I draft the audit-log Prisma model + helper + apply it to the
  10 most sensitive procedures.
- **C.** I draft the security headers + CSP `Report-Only` rollout plan,
  including a test plan to validate Clerk/PostHog/Sentry origins.
- **D.** I read the Next.js 16 docs in `node_modules/next/dist/docs/`
  to resolve the M-7 server-action CSRF question.

My recommendation is **A** — fix the bleeding before adding mechanism.
Specifically: ship the C-1 patch in the next 24 hours; the rest of the
critical/high block can land within a week.

—

*If you want any single finding expanded, ask. Each one above can become
a 30-minute fix-and-ship session.*
