# TreeLot SaaS — Claude Code Build Brief

## Context
I am building TreeLot, a SaaS platform for Christmas tree lot operators.
I have validated the full product design using HTML mockups located in /mockups/.
Read CLAUDE.md before doing anything else.

## Your job
Scaffold and build the MVP of this application following the tech stack and file
structure defined in CLAUDE.md. Work through the phases below in order.
Do not skip ahead. Confirm with me before starting each new phase.

---

## Phase 1 — Project scaffold (do this first)

1. Initialize Next.js 14 project with App Router and TypeScript
2. Install and configure:
   - Tailwind CSS with custom brand colors from CLAUDE.md
   - Clerk for auth (multi-tenant, role-based)
   - Prisma with Neon PostgreSQL connection
   - tRPC with Next.js adapter
   - Zod
3. Create the folder structure from CLAUDE.md
4. Set up environment variables file (.env.local.example) with all required keys:
   - DATABASE_URL (Neon)
   - CLERK_SECRET_KEY + CLERK_PUBLISHABLE_KEY
   - NEXT_PUBLIC_CLERK_* redirect URLs
5. Configure Clerk middleware to protect all routes under /(dashboard)
6. Create a basic layout for /(dashboard) with:
   - Dark green sidebar (160px) matching the mockup
   - Navigation items: POS, Deliveries, Customers, Analytics, Sales, Settings
   - Top bar with org name, location pill, user name, time
7. Confirm everything runs on localhost:3000 before proceeding

---

## Phase 2 — Database schema

Build the Prisma schema exactly as follows. Run migrations after.

### Tables required:

**organizations**
- id (uuid, pk)
- name (text)
- plan (enum: starter, pro, enterprise)
- stripeCustomerId (text, nullable)
- taxRateBps (int, default 825) — basis points, 825 = 8.25%
- createdAt (timestamptz)

**locations**
- id (uuid, pk)
- orgId (uuid, fk → organizations)
- name (text)
- address (text)
- timezone (text, default "America/Chicago")
- createdAt (timestamptz)

**users** (mirrors Clerk, stores role + org assignment)
- id (uuid, pk)
- clerkId (text, unique) — Clerk user ID
- orgId (uuid, fk → organizations)
- locationId (uuid, fk → locations, nullable) — null = all locations
- role (enum: owner, manager, staff, driver)
- name (text)
- email (text)
- phone (text, nullable)
- pin (text, nullable) — hashed 4-digit PIN for driver login
- createdAt (timestamptz)

**customers**
- id (uuid, pk)
- orgId (uuid, fk → organizations) — org-scoped, not location-scoped
- firstName (text)
- lastName (text)
- phone (text) — E.164 format, indexed
- email (text, nullable, indexed)
- addressLine1 (text, nullable)
- city (text, nullable)
- state (text, nullable)
- zip (text, nullable)
- notes (text, nullable)
- createdAt (timestamptz)
- updatedAt (timestamptz)

Add GIN trigram index on (firstName, lastName, phone, email) for fuzzy search.
Enable pg_trgm extension in a migration.

**purchases**
- id (uuid, pk)
- customerId (uuid, fk → customers)
- locationId (uuid, fk → locations)
- createdById (uuid, fk → users)
- seasonYear (int) — e.g. 2025
- treeType (text) — "Fraser Fir", "Noble Fir", "Other"
- treeTypeName (text, nullable) — custom name if Other
- treeSizeRange (text) — "3-5ft", "6-8ft", etc.
- subtotalCents (int) — amount before tax
- taxCents (int) — calculated tax
- totalCents (int) — subtotalCents + taxCents
- paymentMethod (enum: cash, card, venmo, zelle)
- standIncluded (boolean, default false)
- lightsIncluded (boolean, default false)
- deliveryRequested (boolean, default false)
- notes (text, nullable)
- purchasedAt (timestamptz)

**deliveries**
- id (uuid, pk)
- purchaseId (uuid, fk → purchases, unique) — 1:1
- customerId (uuid, fk → customers)
- locationId (uuid, fk → locations)
- driverId (uuid, fk → users, nullable)
- addressLine1 (text)
- city (text)
- state (text)
- zip (text)
- lat (decimal, nullable) — geocoded
- lng (decimal, nullable) — geocoded
- deliveryDate (date)
- timeWindow (enum: morning, afternoon, evening, anytime)
- standIncluded (boolean)
- lightsIncluded (boolean)
- installRequested (boolean, default false)
- routeOrder (int, nullable)
- status (enum: unassigned, scheduled, out_for_delivery, delivered, failed)
- specialInstructions (text, nullable)
- driverNotes (text, nullable)
- issueReason (text, nullable)
- deliveredAt (timestamptz, nullable)
- createdAt (timestamptz)
- updatedAt (timestamptz)

---

## Phase 3 — Customer search (most critical feature)

Build the fuzzy customer search. This must be fast — under 200ms for orgs with 50,000 customers.

1. Enable pg_trgm in a migration:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   CREATE INDEX customers_search_gin ON customers
     USING GIN ((first_name || ' ' || last_name || ' ' || COALESCE(phone,'') || ' ' || COALESCE(email,'')) gin_trgm_ops);
   ```

2. Create tRPC router: `customers.search`
   - Input: `{ query: string, orgId: string }`
   - Query using raw SQL with pg_trgm similarity
   - Return top 10 matches with: id, firstName, lastName, phone, email, seasons count, most recent purchase summary
   - Org-scoped at the query level — never return cross-org data

3. Create tRPC router: `customers.getById`
   - Returns full profile + all purchases sorted by seasonYear desc
   - Include purchase → delivery relationship

4. Create tRPC router: `customers.create`
   - Required: firstName, lastName, phone
   - Optional: email, addressLine1, city, state, zip, notes

5. Create tRPC router: `customers.update`

---

## Phase 4 — POS screen

Build the POS screen at /pos matching the mockup in /mockups/treelot_desktop_v7.html

Key requirements:
- Left panel (250px): customer search + customer list
- Center panel: order builder (combos, tree type, size, add-ons, delivery form, notes)
- Right panel (285px): payment calculator with numpad, subtotal/tax/total display, cash change calculation
- Customer search calls customers.search tRPC with debounce (150ms)
- Selecting a customer loads their profile and purchase history
- Quick combos pre-fill the form
- Delivery toggle expands structured form (address, date, time window, install, notes)
- Delivery form validation: address and date are required before checkout
- "Complete sale" creates a purchase + delivery (if applicable) in a single DB transaction
- Tax calculated from org.taxRateBps
- All money in cents on the server, displayed as dollars on client

tRPC mutations needed:
- `purchases.create` — creates purchase + delivery atomically
- `deliveries.create` — (called within purchases.create transaction)

---

## Phase 5 — Delivery dispatcher

Build the delivery dispatcher at /deliveries matching /mockups/treelot_desktop_v7.html

Three-column layout:
- Left (270px): delivery queue grouped by time window, filterable
- Center: route board with drag-and-drop ordering (use @hello-pangea/dnd)
- Right (270px): delivery detail panel

tRPC routers needed:
- `deliveries.getByDate` — returns all deliveries for a location + date
- `deliveries.assignDriver` — sets driverId, updates status to scheduled
- `deliveries.setRouteOrder` — bulk update routeOrder array in single transaction
- `deliveries.updateStatus` — status transitions with validation
- `deliveries.getById` — full delivery details

Drag and drop:
- Use @hello-pangea/dnd (maintained fork of react-beautiful-dnd)
- On drop: call deliveries.setRouteOrder with new order array
- Optimistic updates on client, rollback on error

Real-time updates (MVP): poll every 30 seconds using React Query's refetchInterval.

---

## Phase 6 — Driver PWA

Build the driver app at /driver matching /mockups/treelot_driver_app.html

This is a completely separate layout — no sidebar, no main app chrome.
Drivers never see any other part of the application.

Requirements:
- PIN login screen: driver selects their name, enters 4-digit PIN
- PIN validated server-side via `drivers.authenticate` tRPC mutation
  - Returns session token (store in sessionStorage, cleared on tab close)
  - Never return another driver's data
- Route screen shows only that driver's assigned stops for today
- Each stop: address, customer name, tree details, add-ons, notes, time window
- Actions: Navigate (opens native maps), Mark delivered, Report issue
- Issue form: reason dropdown + notes, calls `deliveries.reportIssue`
- "Start route" marks all scheduled → out_for_delivery in bulk
- PWA manifest at /driver/manifest.json
- Service worker at /driver-sw.js for offline caching

tRPC routers:
- `drivers.authenticate` — validate PIN, return driver's stops for today
- `drivers.getMyRoute` — authenticated, returns stops in routeOrder
- `deliveries.markDelivered` — driver-scoped, can only update their own stops
- `deliveries.reportIssue` — sets status to failed + stores reason/notes

---

## Phase 7 — Sales command center

Build the Sales tab at /sales matching the dashboard in the existing HTML.

This can use Chart.js directly in a client component (wrap in 'use client').

tRPC routers:
- `analytics.hourlySales` — 24-element array of {hour, revenue, transactions}
- `analytics.dailySummary` — revenue, transactions, AOV, attach rates for date range
- `analytics.seasonTrend` — daily revenue array for Nov–Dec

Filters: Today / This week / This season (query param driven, shareable URL).

---

## Build order rules
1. Always run `prisma migrate dev` after schema changes
2. Always add tRPC router to the root router before using it
3. Test each phase on localhost before moving to the next
4. Use Vercel preview deployments for each phase (push to a branch)
5. Ask me before adding any dependency not listed in this document

## Definition of done for MVP
- [ ] Customer search returns results in under 200ms
- [ ] Full checkout (returning customer) in under 5 taps
- [ ] Delivery created in POS appears in dispatcher immediately
- [ ] Driver marks delivered → dispatcher updates within 30 seconds
- [ ] Driver app installable as PWA on iPhone and Android
- [ ] No cross-org data leakage possible at API level
- [ ] All money stored as integers, never floats
- [ ] Tax calculated from org setting, not hardcoded
