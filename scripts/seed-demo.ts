/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Demo seed — wipes and re-populates the org with realistic Christmas tree
 * lot data across 4 seasons so every page has compelling demo content.
 *
 *   npm run seed:demo
 *
 * IDs default to the dev test org. Override with:
 *   DEMO_ORG_ID / DEMO_LOCATION_ID / DEMO_USER_ID
 */
import { config } from 'dotenv';
config();
config({ path: '.env.local', override: true });

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';


const ORG_ID      = process.env.DEMO_ORG_ID      ?? 'e82e886b-842a-44fc-9a0b-91821cf8e6e5';
const LOCATION_ID = process.env.DEMO_LOCATION_ID  ?? '728060d6-4239-4622-ae0d-1f0b6fbb5d9a';
const USER_ID     = process.env.DEMO_USER_ID      ?? '877ddf10-efd5-4dcd-9ce5-a8c7de3c7044';
const TAX_BPS     = 825;

// ─── Types ────────────────────────────────────────────────────────────────────

type PaymentMethod  = 'cash' | 'card' | 'venmo' | 'zelle';
type TimeWindow     = 'morning' | 'afternoon' | 'evening' | 'anytime';
type DeliveryStatus = 'unassigned' | 'scheduled' | 'out_for_delivery' | 'delivered' | 'failed';
type DeliveryProfile = 'always' | 'sometimes' | 'never';

// ─── Season map ───────────────────────────────────────────────────────────────
// seasonYear is the label the app displays (e.g. "2026").
// purchasedAtYear is the calendar year the lot actually operated (Nov–Dec).
// A "2026 season" means the lot ran Nov–Dec 2025.

const SEASONS = [
  { seasonYear: 2023, purchasedAtYear: 2022 },
  { seasonYear: 2024, purchasedAtYear: 2023 },
  { seasonYear: 2025, purchasedAtYear: 2024 },
  { seasonYear: 2026, purchasedAtYear: 2025 }, // current
] as const;

// ─── Customer pool ─────────────────────────────────────────────────────────────
// Tiers by index:
//   Veteran   (0–3)  — buys all 4 seasons
//   3-season  (4–10) — buys seasons 2024, 2025, 2026
//   2-season  (11–19)— buys seasons 2025, 2026
//   Brand new (20–29)— buys season 2026 only

const CUSTOMER_POOL = [
  // ── Veteran (0–3) ───────────────────────────────────────────────────────────
  { firstName: 'James',       lastName: 'Harrison',  phone: '2145550101', email: 'jharrison@email.com',   addressLine1: '4218 Cole Ave',         city: 'Dallas', state: 'TX', zip: '75205' },
  { firstName: 'Sophia',      lastName: 'Martinez',  phone: '2145550102', email: 'smartinez@email.com',   addressLine1: '6145 Mockingbird Ln',   city: 'Dallas', state: 'TX', zip: '75214' },
  { firstName: 'Michael',     lastName: 'Thompson',  phone: '2145550103', email: 'mthompson@email.com',   addressLine1: '3104 Greenville Ave',   city: 'Dallas', state: 'TX', zip: '75206' },
  { firstName: 'Emily',       lastName: 'Chen',      phone: '2145550104', email: 'echen@email.com',       addressLine1: '8800 Park Ln',          city: 'Dallas', state: 'TX', zip: '75231' },
  // ── 3-season (4–10) ─────────────────────────────────────────────────────────
  { firstName: 'Robert',      lastName: 'Walker',    phone: '2145550105', email: null,                    addressLine1: '2727 Routh St',         city: 'Dallas', state: 'TX', zip: '75201' },
  { firstName: 'Ashley',      lastName: 'Johnson',   phone: '2145550106', email: 'ajohnson@email.com',    addressLine1: '5950 Maple Ave',        city: 'Dallas', state: 'TX', zip: '75235' },
  { firstName: 'David',       lastName: 'Kim',       phone: '2145550107', email: 'dkim@email.com',        addressLine1: '1120 Beverly Dr',       city: 'Dallas', state: 'TX', zip: '75208' },
  { firstName: 'Jessica',     lastName: 'Brown',     phone: '2145550108', email: null,                    addressLine1: '4915 Swiss Ave',        city: 'Dallas', state: 'TX', zip: '75214' },
  { firstName: 'William',     lastName: 'Garcia',    phone: '2145550109', email: 'wgarcia@email.com',     addressLine1: '7200 Skillman St',      city: 'Dallas', state: 'TX', zip: '75231' },
  { firstName: 'Lauren',      lastName: 'Davis',     phone: '2145550110', email: 'ldavis@email.com',      addressLine1: '3601 Gaston Ave',       city: 'Dallas', state: 'TX', zip: '75246' },
  { firstName: 'Christopher', lastName: 'Wilson',    phone: '2145550111', email: null,                    addressLine1: '5225 Maple Ave',        city: 'Dallas', state: 'TX', zip: '75235' },
  // ── 2-season (11–19) ────────────────────────────────────────────────────────
  { firstName: 'Amanda',      lastName: 'Taylor',    phone: '2145550112', email: 'ataylor@email.com',     addressLine1: '2001 McKinney Ave',     city: 'Dallas', state: 'TX', zip: '75201' },
  { firstName: 'Matthew',     lastName: 'Anderson',  phone: '2145550113', email: null,                    addressLine1: '6301 Kenwood Ave',      city: 'Dallas', state: 'TX', zip: '75214' },
  { firstName: 'Stephanie',   lastName: 'White',     phone: '2145550114', email: 'swhite@email.com',      addressLine1: '4200 Junius St',        city: 'Dallas', state: 'TX', zip: '75246' },
  { firstName: 'Joshua',      lastName: 'Lee',       phone: '2145550115', email: 'jlee@email.com',        addressLine1: '1800 N Beckley Ave',    city: 'Dallas', state: 'TX', zip: '75208' },
  { firstName: 'Megan',       lastName: 'Harris',    phone: '2145550116', email: null,                    addressLine1: '3800 Fairmount St',     city: 'Dallas', state: 'TX', zip: '75219' },
  { firstName: 'Daniel',      lastName: 'Clark',     phone: '2145550117', email: 'dclark@email.com',      addressLine1: '6500 Lakewood Blvd',   city: 'Dallas', state: 'TX', zip: '75214' },
  { firstName: 'Rachel',      lastName: 'Lewis',     phone: '2145550118', email: 'rlewis@email.com',      addressLine1: '2300 Cedar Springs Rd', city: 'Dallas', state: 'TX', zip: '75201' },
  { firstName: 'Andrew',      lastName: 'Robinson',  phone: '2145550119', email: null,                    addressLine1: '9100 Garland Rd',       city: 'Dallas', state: 'TX', zip: '75218' },
  { firstName: 'Brittany',    lastName: 'Hall',      phone: '2145550120', email: 'bhall@email.com',       addressLine1: '4400 Lovers Ln',        city: 'Dallas', state: 'TX', zip: '75225' },
  // ── Brand new (20–29) ───────────────────────────────────────────────────────
  { firstName: 'Kevin',       lastName: 'Young',     phone: '2145550121', email: 'kyoung@email.com',      addressLine1: '3300 Swiss Ave',        city: 'Dallas', state: 'TX', zip: '75204' },
  { firstName: 'Michelle',    lastName: 'Allen',     phone: '2145550122', email: null,                    addressLine1: '7700 E Grand Ave',      city: 'Dallas', state: 'TX', zip: '75223' },
  { firstName: 'Ryan',        lastName: 'Scott',     phone: '2145550123', email: 'rscott@email.com',      addressLine1: '5100 Reiger Ave',       city: 'Dallas', state: 'TX', zip: '75214' },
  { firstName: 'Kimberly',    lastName: 'Wright',    phone: '2145550124', email: 'kwright@email.com',     addressLine1: '2800 N Henderson Ave',  city: 'Dallas', state: 'TX', zip: '75206' },
  { firstName: 'Brandon',     lastName: 'Lopez',     phone: '2145550125', email: null,                    addressLine1: '1400 Elm St',           city: 'Dallas', state: 'TX', zip: '75202' },
  { firstName: 'Nicole',      lastName: 'Hill',      phone: '2145550126', email: 'nhill@email.com',       addressLine1: '6200 Abrams Rd',        city: 'Dallas', state: 'TX', zip: '75214' },
  { firstName: 'Tyler',       lastName: 'Green',     phone: '2145550127', email: null,                    addressLine1: '3500 Oak Lawn Ave',     city: 'Dallas', state: 'TX', zip: '75219' },
  { firstName: 'Samantha',    lastName: 'Adams',     phone: '2145550128', email: 'sadams@email.com',      addressLine1: '8300 Greenville Ave',   city: 'Dallas', state: 'TX', zip: '75243' },
  { firstName: 'Eric',        lastName: 'Baker',     phone: '2145550129', email: 'ebaker@email.com',      addressLine1: '4700 Ross Ave',         city: 'Dallas', state: 'TX', zip: '75204' },
  { firstName: 'Heather',     lastName: 'Nelson',    phone: '2145550130', email: null,                    addressLine1: '2100 Live Oak St',      city: 'Dallas', state: 'TX', zip: '75204' },
];

// ─── Delivery profile per customer index ──────────────────────────────────────
// Veterans 0–3:   2 always + 2 sometimes
// 3-season 4–10:  3 always + 2 sometimes + 2 never
// 2-season 11–19: 1 always + 3 sometimes + 5 never
// Brand new 20–29:1 sometimes + 9 never

const DELIVERY_PROFILES: DeliveryProfile[] = [
  'always',    // 0  Harrison  (veteran)
  'always',    // 1  Martinez  (veteran)
  'sometimes', // 2  Thompson  (veteran)
  'sometimes', // 3  Chen      (veteran)
  'always',    // 4  Walker    (3-season)
  'always',    // 5  Johnson   (3-season)
  'always',    // 6  Kim       (3-season)
  'sometimes', // 7  Brown     (3-season)
  'sometimes', // 8  Garcia    (3-season)
  'never',     // 9  Davis     (3-season)
  'never',     // 10 Wilson    (3-season)
  'always',    // 11 Taylor    (2-season)
  'sometimes', // 12 Anderson  (2-season)
  'sometimes', // 13 White     (2-season)
  'sometimes', // 14 Lee       (2-season)
  'never',     // 15 Harris    (2-season)
  'never',     // 16 Clark     (2-season)
  'never',     // 17 Lewis     (2-season)
  'never',     // 18 Robinson  (2-season)
  'never',     // 19 Hall      (2-season)
  'sometimes', // 20 Young     (new)
  'never',     // 21 Allen     (new)
  'never',     // 22 Scott     (new)
  'never',     // 23 Wright    (new)
  'never',     // 24 Lopez     (new)
  'never',     // 25 Hill      (new)
  'never',     // 26 Green     (new)
  'never',     // 27 Adams     (new)
  'never',     // 28 Baker     (new)
  'never',     // 29 Nelson    (new)
];

// ─── Product data ─────────────────────────────────────────────────────────────

type TreeChoice = { treeType: string; treeTypeName: string | null };

const TREE_CHOICES: TreeChoice[] = [
  { treeType: 'Fraser Fir', treeTypeName: null },
  { treeType: 'Fraser Fir', treeTypeName: null },
  { treeType: 'Fraser Fir', treeTypeName: null },
  { treeType: 'Noble Fir',  treeTypeName: null },
  { treeType: 'Noble Fir',  treeTypeName: null },
  { treeType: 'Other',      treeTypeName: 'Douglas Fir' },
  { treeType: 'Other',      treeTypeName: 'Blue Spruce' },
];

const SIZES = ['3–5ft', '6–8ft', '6–8ft', '6–8ft', '9–10ft', '9–10ft', '11–12ft', '14ft+'];

const PAYMENTS: PaymentMethod[] = [
  'cash', 'cash', 'cash', 'cash',
  'card', 'card', 'card', 'card', 'card', 'card',
  'venmo', 'venmo',
  'zelle',
];

// ─── Delivery board fixtures — 15 entries, all 5 statuses ────────────────────
// 4 delivered · 2 out_for_delivery · 3 scheduled · 4 unassigned · 2 failed

type DeliveryFixture = {
  custIdx: number;
  status:  DeliveryStatus;
  window:      TimeWindow;
  stand:       boolean;
  lights:      boolean;
  install:     boolean;
  notes:       string | null;
  needsDriver: boolean; // delivered/out_for_delivery/scheduled must have a driver
};

const DELIVERY_FIXTURES: DeliveryFixture[] = [
  { custIdx: 0,  status: 'delivered',        window: 'morning',   stand: true,  lights: true,  install: false, needsDriver: true,  notes: 'Gate code 4827. Leave on porch if no answer.' },
  { custIdx: 1,  status: 'delivered',        window: 'morning',   stand: true,  lights: false, install: true,  needsDriver: true,  notes: 'Two large dogs — call on arrival.' },
  { custIdx: 2,  status: 'delivered',        window: 'afternoon', stand: false, lights: false, install: false, needsDriver: true,  notes: null },
  { custIdx: 3,  status: 'delivered',        window: 'afternoon', stand: true,  lights: true,  install: true,  needsDriver: true,  notes: 'Place tree in great room, left of foyer.' },
  { custIdx: 4,  status: 'out_for_delivery', window: 'morning',   stand: true,  lights: false, install: false, needsDriver: true,  notes: null },
  { custIdx: 5,  status: 'out_for_delivery', window: 'afternoon', stand: true,  lights: true,  install: false, needsDriver: true,  notes: 'Left tip in cash envelope last year.' },
  { custIdx: 6,  status: 'scheduled',        window: 'evening',   stand: false, lights: false, install: false, needsDriver: true,  notes: null },
  { custIdx: 7,  status: 'scheduled',        window: 'anytime',   stand: true,  lights: false, install: false, needsDriver: true,  notes: null },
  { custIdx: 8,  status: 'scheduled',        window: 'morning',   stand: true,  lights: true,  install: true,  needsDriver: true,  notes: 'Ring doorbell twice — hard of hearing.' },
  { custIdx: 11, status: 'unassigned',       window: 'afternoon', stand: true,  lights: false, install: false, needsDriver: false, notes: null },
  { custIdx: 12, status: 'unassigned',       window: 'anytime',   stand: false, lights: false, install: false, needsDriver: false, notes: null },
  { custIdx: 13, status: 'unassigned',       window: 'morning',   stand: true,  lights: true,  install: false, needsDriver: false, notes: 'Fragile ornaments on mantle — be careful on porch.' },
  { custIdx: 14, status: 'unassigned',       window: 'evening',   stand: true,  lights: false, install: false, needsDriver: false, notes: null },
  { custIdx: 15, status: 'failed',           window: 'anytime',   stand: true,  lights: true,  install: false, needsDriver: false, notes: 'Customer not home — reschedule.' },
  { custIdx: 20, status: 'failed',           window: 'afternoon', stand: false, lights: false, install: false, needsDriver: false, notes: 'Address not found. Called customer, went to voicemail.' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 60% buy 1 tree, 30% buy 2, 10% buy 3 per season
function treeCount(): number {
  const r = Math.random();
  if (r < 0.60) return 1;
  if (r < 0.90) return 2;
  return 3;
}

// Generates a date daysAgo before today at a realistic lot hour (9am–8pm)
function recentDate(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(randInt(9, 20), randInt(0, 59), 0, 0);
  return d;
}

// Generates dates in Nov 1 – Dec 24 of the given calendar year
function randomSeasonDate(calendarYear: number): Date {
  const nov1  = Date.UTC(calendarYear, 10, 1);
  const dec24 = Date.UTC(calendarYear, 11, 24, 23, 59, 0);
  const d     = new Date(nov1 + Math.random() * (dec24 - nov1));
  d.setUTCHours(randInt(9, 21), randInt(0, 59), 0, 0);
  return d;
}

// 70% of multi-tree purchases happen same day (8–20 min apart).
// 30% are a return visit 3–10 days later.
function visitDates(base: Date, count: number): Date[] {
  if (count === 1) return [base];

  const isReturnVisit = Math.random() < 0.30;
  const dates: Date[] = [base];

  if (!isReturnVisit) {
    for (let i = 1; i < count; i++) {
      const prev = dates[i - 1];
      dates.push(new Date(prev.getTime() + randInt(8, 20) * 60_000));
    }
  } else {
    const returnDay = new Date(base);
    returnDay.setUTCDate(returnDay.getUTCDate() + randInt(3, 10));
    // Clamp to Dec 24 so return visits stay in season
    const dec24 = new Date(Date.UTC(base.getUTCFullYear(), 11, 24));
    if (returnDay > dec24) returnDay.setTime(dec24.getTime());
    for (let i = 1; i < count; i++) {
      dates.push(new Date(returnDay.getTime() + randInt(0, 10) * 60_000));
    }
  }
  return dates;
}

// Seeds one customer's purchases for one season.
// Returns the number of purchase records created.
async function seedCustomerSeason(
  prisma: PrismaClient,
  customerId: string,
  custIdx: number,
  seasonYear: number,
  purchasedAtYear: number,
): Promise<number> {
  const profile = DELIVERY_PROFILES[custIdx];
  const count   = treeCount();
  const base    = randomSeasonDate(purchasedAtYear);
  const dates   = visitDates(base, count);

  for (let i = 0; i < count; i++) {
    const deliveryRequested =
      profile === 'always'    ? true :
      profile === 'sometimes' ? Math.random() < 0.50 :
      false;

    const tree          = pick(TREE_CHOICES);
    const subtotalCents = randInt(80, 320) * 100;
    const taxCents      = Math.round((subtotalCents * TAX_BPS) / 10000);

    await prisma.purchase.create({
      data: {
        customerId,
        locationId:        LOCATION_ID,
        createdById:       USER_ID,
        seasonYear,
        treeType:          tree.treeType,
        treeTypeName:      tree.treeTypeName,
        treeSizeRange:     pick(SIZES),
        subtotalCents,
        taxCents,
        totalCents:        subtotalCents + taxCents,
        paymentMethod:     pick(PAYMENTS),
        standIncluded:     Math.random() < 0.65,
        lightsIncluded:    Math.random() < 0.25,
        deliveryRequested,
        notes:             null,
        purchasedAt:       dates[i],
      },
    });
  }
  return count;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma  = new PrismaClient({ adapter });

  // ── Wipe existing demo data (FK order: deliveries → purchases → customers) ──
  console.log('Clearing demo data…');
  await prisma.delivery.deleteMany({ where: { locationId: LOCATION_ID } });
  await prisma.purchase.deleteMany({ where: { locationId: LOCATION_ID } });
  await prisma.customer.deleteMany({ where: { orgId: ORG_ID } });
  console.log('  ✓ Cleared');

  // ── Create customers ──────────────────────────────────────────────────────
  console.log('\nCreating customers…');
  const customers: Array<{ id: string; firstName: string; lastName: string; addressLine1: string | null; city: string | null; state: string | null; zip: string | null }> = [];
  for (const c of CUSTOMER_POOL) {
    customers.push(await prisma.customer.create({ data: { orgId: ORG_ID, ...c } }));
  }
  console.log(`  ✓ ${customers.length} customers`);

  // ── Season purchases ──────────────────────────────────────────────────────
  // Delivery fixture customers are seeded separately below with a linked Delivery record.
  const deliveryCustIdxs = new Set(DELIVERY_FIXTURES.map(f => f.custIdx));

  const seasonCounts: Record<number, number> = { 2023: 0, 2024: 0, 2025: 0, 2026: 0 };
  let totalPurchases = 0;

  for (const { seasonYear, purchasedAtYear } of SEASONS) {
    // Determine which customers shop this season based on their tier
    let minIdx: number;
    if (seasonYear === 2023) minIdx = 0;       // veterans only
    else if (seasonYear === 2024) minIdx = 0;  // veterans + 3-season
    else if (seasonYear === 2025) minIdx = 0;  // veterans + 3-season + 2-season
    else minIdx = 0;                           // all 30

    const maxIdx =
      seasonYear === 2023 ? 3  :   // indices 0–3
      seasonYear === 2024 ? 10 :   // indices 0–10
      seasonYear === 2025 ? 19 :   // indices 0–19
      29;                          // all 30 for current 2026

    console.log(`\nSeeding ${seasonYear} season (purchasedAt in Nov–Dec ${purchasedAtYear})…`);

    for (let i = minIdx; i <= maxIdx; i++) {
      // Skip delivery-fixture customers in the current season — handled below
      if (seasonYear === 2026 && deliveryCustIdxs.has(i)) continue;

      const n = await seedCustomerSeason(prisma, customers[i].id, i, seasonYear, purchasedAtYear);
      seasonCounts[seasonYear] += n;
      totalPurchases += n;
    }
    console.log(`  ✓ ${seasonCounts[seasonYear]} purchases`);
  }

  // ── Current season (2026) delivery purchases + delivery records ───────────
  console.log('\nCreating 2026 delivery purchases…');
  const { purchasedAtYear: currentPurchasedAtYear } = SEASONS[SEASONS.length - 1]; // 2025

  const todayUtc    = new Date();
  const deliveryDay = new Date(Date.UTC(
    todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate(),
  ));

  let deliveryCount = 0;

  for (const fix of DELIVERY_FIXTURES) {
    const cust        = customers[fix.custIdx];
    const tree        = pick(TREE_CHOICES);
    const subtotalCents = randInt(80, 280) * 100;
    const taxCents    = Math.round((subtotalCents * TAX_BPS) / 10000);
    const totalCents  = subtotalCents + taxCents;

    const purchase = await prisma.purchase.create({
      data: {
        customerId:        cust.id,
        locationId:        LOCATION_ID,
        createdById:       USER_ID,
        seasonYear:        2026,
        treeType:          tree.treeType,
        treeTypeName:      tree.treeTypeName,
        treeSizeRange:     pick(SIZES),
        subtotalCents,
        taxCents,
        totalCents,
        paymentMethod:     pick(PAYMENTS),
        standIncluded:     fix.stand,
        lightsIncluded:    fix.lights,
        deliveryRequested: true,
        notes:             null,
        purchasedAt:       randomSeasonDate(currentPurchasedAtYear),
      },
    });
    seasonCounts[2026]++;
    totalPurchases++;

    await prisma.delivery.create({
      data: {
        purchaseId:          purchase.id,
        customerId:          cust.id,
        locationId:          LOCATION_ID,
        driverId:            fix.needsDriver ? USER_ID : null,
        addressLine1:        cust.addressLine1 ?? '123 Main St',
        city:                cust.city        ?? 'Dallas',
        state:               cust.state       ?? 'TX',
        zip:                 cust.zip         ?? '75201',
        deliveryDate:        deliveryDay,
        timeWindow:          fix.window,
        standIncluded:       fix.stand,
        lightsIncluded:      fix.lights,
        installRequested:    fix.install,
        status:              fix.status,
        specialInstructions: fix.notes,
        deliveredAt:         fix.status === 'delivered' ? new Date() : null,
      },
    });

    const icon =
      fix.status === 'delivered'        ? '✓' :
      fix.status === 'failed'           ? '✗' :
      fix.status === 'out_for_delivery' ? '→' : '·';
    console.log(`  ${icon} ${cust.firstName} ${cust.lastName} (${fix.status})`);
    deliveryCount++;
  }

  // ── Recent purchases — populates Sales tab Today + This Week ranges ───────
  // Customers not in the delivery fixture list, purchasing walk-in today / this week.
  console.log('\nSeeding recent walk-in purchases (today + this week)…');
  const recentCustIdxs = [9, 10, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26];
  const recentSchedule: Array<{ custIdx: number; daysAgo: number }> = [
    { custIdx: 9,  daysAgo: 0 },
    { custIdx: 10, daysAgo: 0 },
    { custIdx: 16, daysAgo: 0 },
    { custIdx: 17, daysAgo: 1 },
    { custIdx: 18, daysAgo: 1 },
    { custIdx: 19, daysAgo: 2 },
    { custIdx: 21, daysAgo: 2 },
    { custIdx: 22, daysAgo: 3 },
    { custIdx: 23, daysAgo: 4 },
    { custIdx: 24, daysAgo: 5 },
    { custIdx: 25, daysAgo: 6 },
    { custIdx: 26, daysAgo: 6 },
  ];
  // Suppress unused-variable warning — recentCustIdxs drives recentSchedule above
  void recentCustIdxs;

  let recentCount = 0;
  for (const { custIdx, daysAgo } of recentSchedule) {
    const cust          = customers[custIdx];
    const tree          = pick(TREE_CHOICES);
    const subtotalCents = randInt(80, 320) * 100;
    const taxCents      = Math.round((subtotalCents * TAX_BPS) / 10000);
    await prisma.purchase.create({
      data: {
        customerId:        cust.id,
        locationId:        LOCATION_ID,
        createdById:       USER_ID,
        seasonYear:        2026,
        treeType:          tree.treeType,
        treeTypeName:      tree.treeTypeName,
        treeSizeRange:     pick(SIZES),
        subtotalCents,
        taxCents,
        totalCents:        subtotalCents + taxCents,
        paymentMethod:     pick(PAYMENTS),
        standIncluded:     Math.random() < 0.65,
        lightsIncluded:    Math.random() < 0.25,
        deliveryRequested: false,
        notes:             null,
        purchasedAt:       recentDate(daysAgo),
      },
    });
    seasonCounts[2026]++;
    totalPurchases++;
    recentCount++;
  }
  console.log(`  ✓ ${recentCount} recent purchases (${recentSchedule.filter(r => r.daysAgo === 0).length} today, ${recentSchedule.filter(r => r.daysAgo > 0).length} earlier this week)`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`
────────────────────────────────────────
  Customers    ${customers.length}
  Purchases    ${totalPurchases}
    2023:      ${seasonCounts[2023]}  (veterans only)
    2024:      ${seasonCounts[2024]}  (veterans + 3-season)
    2025:      ${seasonCounts[2025]}  (veterans + 3-season + 2-season)
    2026:      ${seasonCounts[2026]}  (all 30, current season)
  Deliveries   ${deliveryCount}
    delivered: 4  ·  out for delivery: 2
    scheduled: 3  ·  unassigned: 4  ·  failed: 2
────────────────────────────────────────
  ✓ Demo data ready — run: npm run dev
`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
