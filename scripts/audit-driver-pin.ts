// READ-ONLY production audit for the H-4 backdoor question.
//
// Reports, for the historic test UUID:
//   - whether the user exists
//   - their role/name/email/locationId
//   - whether the stored PIN bcrypts to "1234" (the old default)
//
// This script writes NOTHING. Safe to run against prod.
//
//   npx tsx scripts/audit-driver-pin.ts
//
// To check a different UUID:
//
//   npx tsx scripts/audit-driver-pin.ts <uuid>
import { config } from 'dotenv';
config();
config({ path: '.env.local', override: true });

const HISTORIC_TEST_UUID = '877ddf10-efd5-4dcd-9ce5-a8c7de3c7044';
const SUSPECT_PIN        = '1234';

async function main() {
  const userId = process.argv[2] ?? HISTORIC_TEST_UUID;
  const bcrypt = (await import('bcryptjs')).default;
  const { prisma } = await import('../lib/db');

  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, name: true, email: true, role: true, locationId: true, orgId: true, pin: true },
  });

  if (!user) {
    console.log(`[OK]  No user found with id ${userId} — H-4 never bit this database.`);
    return;
  }

  console.log(`User found:`);
  console.log(`  id:         ${user.id}`);
  console.log(`  name:       ${user.name}`);
  console.log(`  email:      ${user.email}`);
  console.log(`  role:       ${user.role}`);
  console.log(`  orgId:      ${user.orgId}`);
  console.log(`  locationId: ${user.locationId}`);
  console.log(`  pin set:    ${user.pin ? 'yes' : 'no'}`);

  if (!user.pin) {
    console.log(`[OK]  No PIN set — nothing to rotate.`);
    return;
  }

  const matches1234 = await bcrypt.compare(SUSPECT_PIN, user.pin);
  if (matches1234) {
    console.log(`[!!]  Stored PIN bcrypts to "${SUSPECT_PIN}". ROTATE NOW:`);
    console.log(`      npx tsx scripts/set-driver-pin.ts ${user.id} <new-pin>`);
    console.log(`      (run locally against prod env, then tell the rightful user the new PIN)`);
  } else {
    console.log(`[OK]  Stored PIN does NOT match "${SUSPECT_PIN}" — H-4 never landed here.`);
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
