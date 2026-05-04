/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Demo "today" seed — adds ~15 purchases dated *today*, spread across
 * 9am–8pm local time, so the Sales Command Center "Today" view populates
 * with a realistic hourly curve, payment mix, and tree/size variety.
 *
 *   npm run seed:today           # refuses if today already has purchases
 *   npm run seed:today -- --force # always inserts another batch
 *   npm run seed:today -- --count=25
 *
 * Reuses customers from `seed-demo.ts`. Run that first if the DB is empty.
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
const LOCATION_ID = process.env.DEMO_LOCATION_ID ?? '728060d6-4239-4622-ae0d-1f0b6fbb5d9a';
const USER_ID     = process.env.DEMO_USER_ID     ?? '877ddf10-efd5-4dcd-9ce5-a8c7de3c7044';
const TAX_BPS     = 825;
const SEASON_YEAR = 2026;

type PaymentMethod = 'cash' | 'card' | 'venmo' | 'zelle';

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

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Returns a Date set to today at the given local hour, with random minute/second.
function todayAt(hour: number): Date {
  const d = new Date();
  d.setHours(hour, randInt(0, 59), randInt(0, 59), 0);
  return d;
}

function startOfTodayLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfTomorrowLocal(): Date {
  const d = startOfTodayLocal();
  d.setDate(d.getDate() + 1);
  return d;
}

function parseArgs(): { force: boolean; count: number } {
  let force = false;
  let count = 15;
  for (const a of process.argv.slice(2)) {
    if (a === '--force') force = true;
    else if (a.startsWith('--count=')) {
      const n = parseInt(a.split('=')[1] ?? '', 10);
      if (Number.isFinite(n) && n > 0) count = n;
    }
  }
  return { force, count };
}

// Spread `count` purchases across business hours 9..20 inclusive (12 hours).
// Uses a weighted curve so afternoon/evening have more traffic than morning.
function pickHour(): number {
  const weights: Array<[number, number]> = [
    [9,  1], [10, 2], [11, 3], [12, 4],
    [13, 5], [14, 5], [15, 6], [16, 6],
    [17, 6], [18, 5], [19, 4], [20, 2],
  ];
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [h, w] of weights) {
    r -= w;
    if (r <= 0) return h;
  }
  return 17;
}

async function main() {
  const { force, count } = parseArgs();

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma  = new PrismaClient({ adapter });

  const start = startOfTodayLocal();
  const end   = startOfTomorrowLocal();

  // ── Idempotency check ─────────────────────────────────────────────────────
  const existing = await prisma.purchase.count({
    where: {
      locationId:  LOCATION_ID,
      purchasedAt: { gte: start, lt: end },
    },
  });

  if (existing > 0 && !force) {
    console.log(
      `Today already has ${existing} purchase${existing === 1 ? '' : 's'} ` +
      `for this location. Pass --force to add more.`,
    );
    await prisma.$disconnect();
    return;
  }

  // ── Pull customer pool ────────────────────────────────────────────────────
  const customers = await prisma.customer.findMany({
    where: { orgId: ORG_ID },
    select: { id: true, firstName: true, lastName: true },
  });

  if (customers.length === 0) {
    console.error(
      'No customers found for this org. Run `npm run seed:demo` first.',
    );
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  console.log(
    `Seeding ${count} purchase${count === 1 ? '' : 's'} for today ` +
    `(${start.toDateString()})…`,
  );

  let revenueCents = 0;
  for (let i = 0; i < count; i++) {
    const customer      = pick(customers);
    const tree          = pick(TREE_CHOICES);
    const subtotalCents = randInt(80, 320) * 100;
    const taxCents      = Math.round((subtotalCents * TAX_BPS) / 10000);
    const totalCents    = subtotalCents + taxCents;

    await prisma.purchase.create({
      data: {
        customerId:        customer.id,
        locationId:        LOCATION_ID,
        createdById:       USER_ID,
        seasonYear:        SEASON_YEAR,
        treeType:          tree.treeType,
        treeTypeName:      tree.treeTypeName,
        treeSizeRange:     pick(SIZES),
        subtotalCents,
        taxCents,
        totalCents,
        paymentMethod:     pick(PAYMENTS),
        standIncluded:     Math.random() < 0.65,
        lightsIncluded:    Math.random() < 0.25,
        deliveryRequested: Math.random() < 0.30,
        notes:             null,
        purchasedAt:       todayAt(pickHour()),
      },
    });
    revenueCents += totalCents;
  }

  console.log(
    `  ✓ ${count} purchases · $${(revenueCents / 100).toFixed(2)} revenue`,
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
