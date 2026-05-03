/* eslint-disable @typescript-eslint/no-require-imports */
import { config } from 'dotenv';
config();
config({ path: '.env.local', override: true });

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';


const TEST_ORG_ID      = 'e82e886b-842a-44fc-9a0b-91821cf8e6e5';
const TEST_LOCATION_ID = '728060d6-4239-4622-ae0d-1f0b6fbb5d9a';
const TEST_USER_ID     = '877ddf10-efd5-4dcd-9ce5-a8c7de3c7044';

type PaymentMethod = 'cash' | 'card' | 'venmo' | 'zelle';

type TreeChoice = { treeType: string; treeTypeName: string | null };

const TREE_CHOICES: TreeChoice[] = [
  { treeType: 'Fraser Fir', treeTypeName: null },
  { treeType: 'Fraser Fir', treeTypeName: null },
  { treeType: 'Fraser Fir', treeTypeName: null },
  { treeType: 'Noble Fir',  treeTypeName: null },
  { treeType: 'Noble Fir',  treeTypeName: null },
  { treeType: 'Other',      treeTypeName: 'Douglas Fir' },
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

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma  = new PrismaClient({ adapter });

  const existing = await prisma.purchase.count({ where: { locationId: TEST_LOCATION_ID } });
  console.log(`Existing purchases at location: ${existing}`);
  if (existing >= 20) {
    console.log('≥20 purchases already; skipping seed.');
    await prisma.$disconnect();
    return;
  }

  const customers = await prisma.customer.findMany({
    where: { orgId: TEST_ORG_ID },
    take: 5,
    orderBy: { createdAt: 'asc' },
  });

  if (customers.length === 0) {
    console.error('No customers found in TEST_ORG_ID — create some via POS first.');
    await prisma.$disconnect();
    process.exit(1);
  }

  const taxRateBps = 825;
  const N = 30;
  let created = 0;

  for (let i = 0; i < N; i++) {
    const cust = customers[i % customers.length];
    const tree = pick(TREE_CHOICES);
    const size = pick(SIZES);
    const payment = pick(PAYMENTS);
    const subtotalCents = randInt(75, 300) * 100;
    const taxCents = Math.round((subtotalCents * taxRateBps) / 10000);
    const totalCents = subtotalCents + taxCents;

    // Random hour 9–21 (9am to 9pm), random minute, random day in the past 14 days
    const daysAgo = randInt(0, 13);
    const hour    = randInt(9, 21);
    const minute  = randInt(0, 59);

    const purchasedAt = new Date();
    purchasedAt.setDate(purchasedAt.getDate() - daysAgo);
    purchasedAt.setHours(hour, minute, 0, 0);

    const deliveryRequested = Math.random() < 0.30;
    const standIncluded     = Math.random() < 0.60;
    const lightsIncluded    = Math.random() < 0.25;

    await prisma.purchase.create({
      data: {
        customerId:        cust.id,
        locationId:        TEST_LOCATION_ID,
        createdById:       TEST_USER_ID,
        seasonYear:        2026,
        treeType:          tree.treeType,
        treeTypeName:      tree.treeTypeName,
        treeSizeRange:     size,
        subtotalCents,
        taxCents,
        totalCents,
        paymentMethod:     payment,
        standIncluded,
        lightsIncluded,
        deliveryRequested,
        notes:             null,
        purchasedAt,
      },
    });

    created++;
    console.log(`✓ ${cust.firstName} ${cust.lastName} — ${tree.treeType} ${size} $${(totalCents / 100).toFixed(2)} (${payment})`);
  }

  console.log(`\nSeeded ${created} purchases.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
