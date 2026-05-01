/* eslint-disable @typescript-eslint/no-require-imports */
import { config } from 'dotenv';
config();
config({ path: '.env.local', override: true });

import { neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '../lib/generated/prisma/client';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const TEST_ORG_ID      = 'e82e886b-842a-44fc-9a0b-91821cf8e6e5';
const TEST_LOCATION_ID = '728060d6-4239-4622-ae0d-1f0b6fbb5d9a';
const TEST_USER_ID     = '877ddf10-efd5-4dcd-9ce5-a8c7de3c7044';

type TimeWindow = 'morning' | 'afternoon' | 'evening' | 'anytime';
type DeliveryStatus = 'unassigned' | 'scheduled' | 'out_for_delivery' | 'delivered' | 'failed';

const SEEDS: Array<{
  treeType: string;
  treeTypeName: string | null;
  treeSizeRange: string;
  subtotalCents: number;
  stand: boolean;
  lights: boolean;
  install: boolean;
  address: string;
  city: string;
  state: string;
  zip: string;
  timeWindow: TimeWindow;
  status: DeliveryStatus;
  notes: string | null;
}> = [
  { treeType: 'Fraser Fir', treeTypeName: null,           treeSizeRange: '6–8ft',  subtotalCents: 12500, stand: true,  lights: true,  install: false,
    address: '4218 Cole Ave',     city: 'Dallas', state: 'TX', zip: '75205', timeWindow: 'morning',   status: 'scheduled',
    notes: 'Gate code 4827. Leave on porch if no answer.' },
  { treeType: 'Noble Fir',  treeTypeName: null,           treeSizeRange: '9–10ft', subtotalCents: 22500, stand: true,  lights: false, install: true,
    address: '6145 Mockingbird',  city: 'Dallas', state: 'TX', zip: '75214', timeWindow: 'morning',   status: 'unassigned',
    notes: 'Two large dogs — call on arrival.' },
  { treeType: 'Other',      treeTypeName: 'Douglas Fir',  treeSizeRange: '6–8ft',  subtotalCents: 9000,  stand: false, lights: false, install: false,
    address: '3104 Greenville',   city: 'Dallas', state: 'TX', zip: '75206', timeWindow: 'afternoon', status: 'unassigned', notes: null },
  { treeType: 'Fraser Fir', treeTypeName: null,           treeSizeRange: '11–12ft',subtotalCents: 27500, stand: true,  lights: true,  install: true,
    address: '8800 Park Ln',      city: 'Dallas', state: 'TX', zip: '75231', timeWindow: 'afternoon', status: 'out_for_delivery',
    notes: 'Place tree in great room (left of foyer).' },
  { treeType: 'Fraser Fir', treeTypeName: null,           treeSizeRange: '6–8ft',  subtotalCents: 13500, stand: true,  lights: false, install: false,
    address: '2727 Routh St',     city: 'Dallas', state: 'TX', zip: '75201', timeWindow: 'evening',   status: 'scheduled', notes: null },
  { treeType: 'Noble Fir',  treeTypeName: null,           treeSizeRange: '6–8ft',  subtotalCents: 17500, stand: true,  lights: true,  install: false,
    address: '5950 Maple Ave',    city: 'Dallas', state: 'TX', zip: '75235', timeWindow: 'evening',   status: 'delivered', notes: 'Tip given in cash.' },
  { treeType: 'Other',      treeTypeName: 'Blue Spruce',  treeSizeRange: '3–5ft',  subtotalCents: 6500,  stand: false, lights: false, install: false,
    address: '1120 Beverly Dr',   city: 'Dallas', state: 'TX', zip: '75208', timeWindow: 'anytime',   status: 'unassigned', notes: null },
  { treeType: 'Fraser Fir', treeTypeName: null,           treeSizeRange: '9–10ft', subtotalCents: 19500, stand: true,  lights: true,  install: false,
    address: '4915 Swiss Ave',    city: 'Dallas', state: 'TX', zip: '75214', timeWindow: 'anytime',   status: 'failed',
    notes: 'Customer not home — reschedule.' },
];

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma  = new PrismaClient({ adapter });

  const customers = await prisma.customer.findMany({
    where: { orgId: TEST_ORG_ID },
    take:  SEEDS.length,
    orderBy: { createdAt: 'asc' },
  });

  if (customers.length === 0) {
    console.error('No customers found in TEST_ORG_ID — create some via POS first.');
    process.exit(1);
  }

  const date  = todayIso();
  const today = new Date(`${date}T00:00:00.000Z`);
  const taxRateBps = 825;

  let created = 0;
  for (let i = 0; i < SEEDS.length; i++) {
    const seed = SEEDS[i];
    const cust = customers[i % customers.length];

    const taxCents   = Math.round((seed.subtotalCents * taxRateBps) / 10000);
    const totalCents = seed.subtotalCents + taxCents;

    await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: {
          customerId:        cust.id,
          locationId:        TEST_LOCATION_ID,
          createdById:       TEST_USER_ID,
          seasonYear:        2026,
          treeType:          seed.treeType,
          treeTypeName:      seed.treeTypeName,
          treeSizeRange:     seed.treeSizeRange,
          subtotalCents:     seed.subtotalCents,
          taxCents,
          totalCents,
          paymentMethod:     'card',
          standIncluded:     seed.stand,
          lightsIncluded:    seed.lights,
          deliveryRequested: true,
          notes:             null,
          purchasedAt:       new Date(),
        },
      });

      await tx.delivery.create({
        data: {
          purchaseId:          purchase.id,
          customerId:          cust.id,
          locationId:          TEST_LOCATION_ID,
          addressLine1:        seed.address,
          city:                seed.city,
          state:               seed.state,
          zip:                 seed.zip,
          deliveryDate:        today,
          timeWindow:          seed.timeWindow,
          standIncluded:       seed.stand,
          lightsIncluded:      seed.lights,
          installRequested:    seed.install,
          status:              seed.status,
          specialInstructions: seed.notes,
          deliveredAt:         seed.status === 'delivered' ? new Date() : null,
        },
      });

      created++;
    });

    console.log(`✓ ${cust.firstName} ${cust.lastName} — ${seed.treeType} (${seed.timeWindow}, ${seed.status})`);
  }

  console.log(`\nSeeded ${created} deliveries for ${date}.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
