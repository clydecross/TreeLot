# TreeLot — Architect Preferences

A running record of architectural decisions for TreeLot. Captures what was
recommended, what was chosen, and what the choice tells us about how Clyde
weighs trade-offs. Future architecture work should consult this first.

> **How to use:** Each decision is logged as it happens. The "Signal" line
> on each entry distills what the choice reveals about Clyde's priorities,
> so subsequent recommendations can be calibrated without re-asking.

---

## Confirmed preferences

| Preference | Source | Notes |
|---|---|---|
| **PayFac architecture is out of scope** | Step 1 confirmation, 2026-05-01 | Defer until payments vendor (Finix/Adyen/etc.) is chosen. Build a usable platform first. |
| **Per-project preference docs** | Step 1 confirmation, 2026-05-01 | This file is `treelot-architect-preferences.md`, scoped to TreeLot. Future projects get their own. |
| **Working style: recommend + 2 alternatives + "yes to proceed"** | Step 1 confirmation, 2026-05-01 | Tiny steps. Each decision should fit in 2–5 min. |

## Working assumptions

| Assumption | Status |
|---|---|
| Solo dev with friend running an actual tree lot giving feedback | **Confirmed.** Friend's feedback is the highest-priority signal — treat his "this is annoying / this would help me" as outranking architectural preference. |
| First paying customer months away | **Confirmed.** Target: 30–50 customers by Christmas tree season (Nov/Dec). |
| Build for 5 customers initially, but architecture must survive 50 | **Confirmed.** No enterprise patterns needed (sharding, DB-per-tenant, etc.); SMB SaaS scale. |
| Demo readiness owned by another agent / track | **Confirmed Step 1** |
| Clyde is non-technical | **Confirmed.** Every recommendation must include plain-English "why" + concrete analogy when useful. No unexplained jargon. |

## Decision log

### Pending

4. Email provider ← **active next**
5. SMS provider
6. Geocoding provider
7. Audit logging strategy
8. Rate limiting / abuse prevention
9. Observability gaps (logs + uptime)
10. Caching layer
11. Analytics separation timing

### Decided

#### Decision 0 — Multi-tenancy pattern · 2026-05-01

- **Recommended**: Row-level isolation. One database, every row tagged with `orgId`, queries auto-scoped to the logged-in user's org via `staffProcedure` / `managerProcedure` / `ownerProcedure` middleware.
- **Chosen**: Recommended.
- **Why**: Industry standard for SMB SaaS. Tree lots share infrastructure but cannot see each other's data — enforced at the code level. Lowest cost, fastest feature velocity, allows cross-customer analytics for the platform owner.
- **Alternatives rejected**: Schema-per-tenant (operational pain at scale: every migration runs N times). Database-per-tenant (5–10× infrastructure cost, can't run analytics across customers, only justified for enterprise compliance customers — none in pipeline).
- **Revisit when**: An enterprise customer demands physical data separation as a contractual requirement. Then offer it as a paid tier rather than re-architect.

## Calibration notes

*Things I've learned about how Clyde weighs trade-offs. Updated as decisions accumulate.*

- **Wants to learn the architecture, not just approve it.** Asked specifically why we're "not doing multi-tenancy" — turned out to be a vocabulary misunderstanding ("shared database" sounded like data mixing). Lesson: introduce technical terms with definitions on first use, and don't assume that picking a "standard" pattern is self-justifying.
- **Reasons in concrete customer terms** ("CRM with hundreds of customers, I don't want their info associated with another tree lot's"). Future recommendations should connect to the *what could go wrong / what does the customer experience* angle, not abstract tech principles.
- **Trusts industry standards once explained.** Once the bank-vault analogy was given, the row-level pattern is expected to be approved without further pushback. Saves time on similar "standard SaaS pattern" calls in the future.
- **Pushes back on conservative/inertia-driven recommendations when migration cost is genuinely low.** On Decision 1 I anchored on "don't switch what works" and recommended Neon. He correctly pointed out that pre-launch with near-zero data is a different calculus, and asked for an honest re-analysis without people-pleasing. Lesson: when migration cost approaches zero, the framing should be "what's the right foundation to build on?" — not "what's already there?" Always weigh switching cost honestly against the actual decision.
- **Asks "don't please me" when he wants the real answer.** Take this literally. When this signal appears, audit the recommendation for any soft-pedaling and present the most honest take.
- **Reasons from the user's experience first.** On TaxJar he didn't ask "what's the most accurate solution?" — he asked "make it work for the user filling out the form." His mental model is "remove friction at every customer touchpoint." Future recommendations should lead with the UX or business impact, then back into the technical choice that delivers it.
- **Moves fast on vendor signups when the trade-off is clear.** Created TaxJar account between messages without prompting. Don't slow him down with extensive vendor pitches — a one-paragraph "here's why this vendor, here's the price, here's how to sign up" is the right shape.

#### Decision 1 — Data layer · 2026-05-01

- **Initial recommendation**: Stay on Neon (anchored on "don't switch what works" — incorrect framing for pre-launch).
- **Revised recommendation after pushback**: Switch to Supabase.
- **Chosen**: Supabase.
- **Why**: Pre-launch, near-zero data, ~30 min migration cost. Supabase Realtime will be needed later for the dispatcher dashboard (instant updates instead of 30s poll). Supabase Storage will be needed within 6–12 months for driver delivery photos, signature capture, receipt PDFs. One vendor for two future needs beats wiring Pusher/Ably + S3 separately.
- **Kept Clerk for auth** (better than Supabase Auth for our use case — orgs, MFA, social login).
- **Setup decisions made for him** (no need to re-litigate):
  - Project created with auto-RLS off (we enforce scoping in tRPC; RLS at DB level would be redundant + a footgun)
  - Auto-expose tables off (we use tRPC, don't need PostgREST endpoints for our private tables)
  - Two connection URLs configured: pooled (port 6543) for runtime, direct (port 5432) for migrations
  - Adapter swapped from `@prisma/adapter-neon` to `@prisma/adapter-pg` (uses standard `pg` driver, works with any Postgres host)
- **Revisit when**: Considering moving to a different Postgres host (only if Supabase becomes a bottleneck). Postgres data is portable.

#### Decision 1.5 — Sales tax lookup provider · 2026-05-01

- **Trigger**: User asked for tax rate to auto-fill from the lot's location during onboarding instead of being entered manually.
- **Recommended**: TaxJar API (free tier 10k calls/mo, paid starts at $19/mo).
- **Chosen**: Recommended.
- **Why**: US sales tax is genuinely complex (state + county + city + districts). Hardcoded state-only lookups would be wrong by 1–3% in most cities. TaxJar is the dominant SaaS for US sales tax (used by Stripe, Square, BigCommerce). At our scale, free tier is effectively unlimited (one call per onboarding + occasional location edits). Same vendor scales when going PayFac for per-transaction tax calculation.
- **Alternatives rejected**: Hardcoded state lookup table (misses 1–3% local additions, requires manual maintenance as rates change). Manual entry only (status quo — friction during onboarding, especially for first-time tree lot owners who may not know their rate).
- **Implementation**: Server-side `tax.lookupRate` tRPC query. Onboarding form auto-extracts ZIP from address string via regex, fires lookup when 5-digit ZIP detected, auto-fills rate field. Owner can override (manual edit blocks future auto-overwrites until address changes). "Verify with your accountant — some states classify Christmas trees as agricultural products" note shown beneath the field.
- **Graceful degradation**: If TAXJAR_API_KEY is unset, lookup throws PRECONDITION_FAILED, form falls back to manual entry without surfacing an error.
- **Revisit when**: Going PayFac (will likely also need per-transaction tax calculation, which TaxJar supports via the same SDK). Or if TaxJar pricing or API quality degrades.

#### Decision 2 — Environment topology · 2026-05-04

- **Recommended**: Two-environment split — one Supabase project + Clerk app for production (real customer data), a separate Supabase project + Clerk app shared by local dev and Vercel previews. Each Vercel env var scoped to Production or Preview accordingly. `DRIVER_SESSION_SECRET` differs between environments so a leaked dev secret can't forge prod sessions.
- **Chosen**: Recommended.
- **Why**: Pre-launch we were running everything on a single Supabase project, including Vercel previews — meaning a buggy preview build or careless cleanup script could nuke the data the friend's tree lot would eventually depend on. The split gives us (a) a safe place to rehearse migrations, (b) isolation between fake demo seed data and real customer rows, and (c) freedom to keep iterating in dev once a real lot goes live in Nov/Dec. Cost: ~$0 — both vendors' free tiers cover an extra project at SMB scale.
- **Alternatives rejected**:
  - Single shared DB across dev/preview/prod (status quo). Cheapest but couples real-customer data to "let me test something" environments. Acceptable as a "not yet" pre-revenue, but explicit decision needed once a real lot is on the way.
  - Three fully isolated environments (separate dev / preview / prod). Maximum isolation, but the marginal benefit at solo-dev scale doesn't justify maintaining three databases + three sets of seed data. Worth revisiting at ~50 customers.
- **Implementation**:
  - `DEPLOY.md` updated to reflect Supabase (was stale, mentioned Neon) and bake in the prod-vs-dev split as the chosen pattern.
  - `.env.local.example` annotated to clarify which values are dev-only and which need separate prod values.
  - User creates `treelot-prod` Supabase project + Clerk Production application; runs `db:migrate` against the new prod URL once before first deploy.
  - Vercel env vars scoped: Production = prod values, Preview = dev values. Local `.env.local` continues pointing to the dev Supabase project.
  - `DRIVER_SESSION_SECRET`: dev secret stays in `.env.local`; freshly-generated prod secret pasted only into Vercel's Production scope.
- **Revisit when**: Reaching ~50 customers AND any of (a) a Vercel preview accidentally writes to prod-shaped data, (b) a destructive integration test is desired, (c) preview deploys start needing isolated test users. At that point bump to three environments and give Vercel previews their own DB.

#### Decision 3 — Background job runner · 2026-05-05

- **Recommended**: Inngest. Managed cron + queue + retries + dashboard, single npm package, jobs defined as TypeScript functions next to the rest of the code. Free tier (50k steps/mo) covers us well past 50 customers. Plays nicely with Vercel — no separate worker to deploy.
- **Chosen**: Recommended.
- **Why**: Several upcoming decisions (D4 email, D5 SMS, D6 geocoding, D7 audit logging) all need to run work *off* the request thread. Picking the runner first prevents wiring the same plumbing three times. Inngest's TS-native dev experience and built-in retries mean a one-line `inngest.send(...)` call from a tRPC mutation gives us reliability we'd otherwise have to build by hand. Plain English: "to-do list for the server" — when something needs doing later or in the background (send a text, retry a failed email), the app drops it on Inngest's list, and Inngest runs it, retries it on failure, and shows a dashboard of what's happening.
- **Alternatives rejected**:
  - Supabase Cron + pg_boss (or pgmq). Stays inside Supabase, no new vendor — Postgres-backed queue we already own. Rejected because there's no built-in dashboard, no managed retry semantics, and we'd be hand-rolling a worker process. Worth revisiting if vendor-minimization becomes a hard constraint.
  - Trigger.dev. Similar shape to Inngest, also TS-native with a free tier. Heavier feature set (long-running workflows, AI tasks). Slightly more vendor lock-in via their SDK pattern. Reasonable second choice if Inngest's pricing changes; saved as a fallback.
- **Implementation**:
  - `inngest@^4.2.6` added to dependencies.
  - Client at `lib/inngest.ts` with typed event schemas via `EventSchemas().fromRecord<...>()`.
  - Functions barrel at `inngest/index.ts`; first function `hello` at `inngest/functions/hello.ts` listens on `treelot/test.hello` (smoke test only).
  - Serve route at `app/api/inngest/route.ts` exports `GET`, `POST`, `PUT` from `serve({ client, functions })` with `dynamic = 'force-dynamic'`.
  - `dev:inngest` script in `package.json` runs the local Inngest dev server (no keys required for local).
  - `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` documented in `.env.local.example` with the standard PER-ENV note. Vercel scoping mirrors D2: dev keys in Preview+Development, prod keys in Production only.
  - Security note: the serve route is a fifth ingress alongside the four auth surfaces. It's gated by Inngest's HMAC signing-key verification, not Clerk/cookies. To be re-confirmed at the next quarterly security baseline.
- **Revisit when**:
  - Inngest free-tier limit (50k steps/mo) starts being hit — the dashboard shows usage, no surprise overage.
  - A real long-running workflow appears (multi-step orchestration spanning hours/days) — Inngest handles this fine, but Trigger.dev's positioning leans harder into it; worth a comparison if the use case dominates.
  - Vendor-minimization becomes a contractual ask (e.g., enterprise customer wants single-cloud) — pivot to Supabase Cron + pg_boss.
