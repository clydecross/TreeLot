// Sets the PIN for a single driver/staff user. Local development tool ONLY.
//
//   tsx scripts/set-driver-pin.ts <userId> <pin>
//
// - Refuses to run if VERCEL_ENV or NODE_ENV is "production".
// - No defaults; both args are required, both shapes are validated.
// - The PIN never appears in stdout (just the user id is echoed back).
//
// History note: an earlier version had a hardcoded UUID + PIN `1234` baked
// in. That was H-4 in security-findings-2026-05-04.md — closed by this
// rewrite. If you ever ran the old version against a non-local DB, rotate
// the affected user's PIN immediately.
import { config } from 'dotenv';
config();
config({ path: '.env.local', override: true });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PIN_RE  = /^\d{4,8}$/;

function refuseInProduction(): void {
  if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
    console.error('Refusing to run in production. This script is for local development only.');
    process.exit(1);
  }
}

function usageAndExit(): never {
  console.error('Usage: tsx scripts/set-driver-pin.ts <userId> <pin>');
  console.error('  userId: UUID of an existing driver/staff user');
  console.error('  pin:    4–8 digits');
  process.exit(1);
}

async function main() {
  refuseInProduction();

  const userId = process.argv[2];
  const pin    = process.argv[3];

  if (!userId || !UUID_RE.test(userId)) usageAndExit();
  if (!pin    || !PIN_RE.test(pin))     usageAndExit();

  // Dynamic imports so dotenv runs first (ES imports are hoisted otherwise).
  const bcrypt = (await import('bcryptjs')).default;
  const { prisma } = await import('../lib/db');

  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, role: true, name: true },
  });
  if (!user) {
    console.error(`No user found with id ${userId}`);
    process.exit(1);
  }
  if (user.role !== 'driver' && user.role !== 'staff') {
    console.error(`User ${userId} has role "${user.role}" — only driver/staff use PINs.`);
    process.exit(1);
  }

  const hash = await bcrypt.hash(pin, 10);
  await prisma.user.update({ where: { id: userId }, data: { pin: hash } });
  // Reset any active lockout on the user since the PIN just changed.
  await prisma.pinFailure.upsert({
    where:  { userId },
    create: { userId, failedAttempts: 0, lockedUntil: null },
    update: { failedAttempts: 0, lockedUntil: null },
  });

  console.log(`PIN updated for ${user.name} (${userId}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
