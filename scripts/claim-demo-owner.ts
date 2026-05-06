// Idempotently binds the demo org's owner User row to your Clerk identity, so
// signing in via Clerk drops you straight into the demo dashboard instead of
// the /onboarding screen. Local-development tool ONLY.
//
//   npm run claim:demo-owner
//
// Reads from env (matches scripts/seed-demo.ts defaults):
//   ADMIN_EMAIL       (required) — email of the Clerk user to bind as owner
//   DEMO_ORG_ID       (default)
//   DEMO_LOCATION_ID  (default)
//   DEMO_USER_ID      (default)
//
// Prereqs: the demo org + location must exist (run `npm run seed:demo` first)
// and the Clerk user must exist (sign in via /sign-in once before claiming).
//
// The User row is keyed on DEMO_USER_ID — re-runs rebind to the current
// ADMIN_EMAIL. The seed:demo wipe does not touch users, so the binding
// survives re-seeds.
//
// Refuses to run when VERCEL_ENV or NODE_ENV is "production", same posture
// as scripts/set-driver-pin.ts.
import { config } from 'dotenv';
config();
config({ path: '.env.local', override: true });

const DEMO_ORG_ID      = process.env.DEMO_ORG_ID      ?? 'e82e886b-842a-44fc-9a0b-91821cf8e6e5';
const DEMO_LOCATION_ID = process.env.DEMO_LOCATION_ID ?? '728060d6-4239-4622-ae0d-1f0b6fbb5d9a';
const DEMO_USER_ID     = process.env.DEMO_USER_ID     ?? '877ddf10-efd5-4dcd-9ce5-a8c7de3c7044';

function refuseInProduction(): void {
  if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
    console.error('Refusing to run in production. This script is for local development only.');
    process.exit(1);
  }
}

async function main() {
  refuseInProduction();

  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  if (!adminEmail) {
    console.error('ADMIN_EMAIL is not set. Add it to .env.local and re-run.');
    process.exit(1);
  }
  if (!process.env.CLERK_SECRET_KEY) {
    console.error('CLERK_SECRET_KEY is not set. Add it to .env.local and re-run.');
    process.exit(1);
  }

  // Dynamic imports so dotenv runs before any module reads process.env.
  const { clerkClient } = await import('@clerk/nextjs/server');
  const { prisma }      = await import('../lib/db');

  // ── Resolve the Clerk user by email ───────────────────────────────────────
  const client     = await clerkClient();
  const lookup     = await client.users.getUserList({ emailAddress: [adminEmail] });
  const candidates = lookup.data;
  // getUserList does substring matching in some SDK versions — re-filter to
  // the exact email (case-insensitive) so we never bind to a near-match.
  const target     = candidates.find((u) =>
    u.emailAddresses.some((e) => e.emailAddress.toLowerCase() === adminEmail.toLowerCase())
  );
  if (!target) {
    console.error(
      `No Clerk user found for ${adminEmail}. Sign in once at /sign-in, ` +
      `then re-run this script.`
    );
    process.exit(1);
  }
  const clerkId      = target.id;
  const primaryEmail =
    target.emailAddresses.find((e) => e.id === target.primaryEmailAddressId)?.emailAddress
    ?? target.emailAddresses[0]?.emailAddress
    ?? adminEmail;
  const fullName     = `${target.firstName ?? ''} ${target.lastName ?? ''}`.trim();
  const name         = fullName || primaryEmail;

  // ── Confirm the demo org + location exist ─────────────────────────────────
  const [org, location] = await Promise.all([
    prisma.organization.findUnique({ where: { id: DEMO_ORG_ID },      select: { id: true } }),
    prisma.location.findUnique({     where: { id: DEMO_LOCATION_ID }, select: { id: true, orgId: true } }),
  ]);
  if (!org) {
    console.error(`Demo org ${DEMO_ORG_ID} not found. Run \`npm run seed:demo\` first.`);
    process.exit(1);
  }
  if (!location || location.orgId !== DEMO_ORG_ID) {
    console.error(`Demo location ${DEMO_LOCATION_ID} not found in demo org. Run \`npm run seed:demo\` first.`);
    process.exit(1);
  }

  // ── Refuse if this Clerk id is already bound to a different User row ──────
  // Otherwise the upsert below would hit the clerkId @unique constraint.
  const existingByClerk = await prisma.user.findUnique({
    where:  { clerkId },
    select: { id: true, orgId: true },
  });
  if (existingByClerk && existingByClerk.id !== DEMO_USER_ID) {
    console.error(
      `Clerk id ${clerkId} is already bound to User ${existingByClerk.id} ` +
      `(org ${existingByClerk.orgId}).\n` +
      `Either delete that User row and re-run, or set DEMO_USER_ID=${existingByClerk.id} ` +
      `in .env.local so the demo seed and this script agree.`
    );
    process.exit(1);
  }

  // ── Upsert the demo owner ─────────────────────────────────────────────────
  await prisma.user.upsert({
    where:  { id: DEMO_USER_ID },
    create: {
      id:         DEMO_USER_ID,
      clerkId,
      orgId:      DEMO_ORG_ID,
      locationId: DEMO_LOCATION_ID,
      role:       'owner',
      name,
      email:      primaryEmail,
    },
    update: {
      clerkId,
      orgId:      DEMO_ORG_ID,
      locationId: DEMO_LOCATION_ID,
      role:       'owner',
      name,
      email:      primaryEmail,
    },
  });

  console.log(`Bound ${primaryEmail} → demo org as owner (User ${DEMO_USER_ID}).`);
  console.log(`Sign in at /sign-in — should land on the dashboard.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
