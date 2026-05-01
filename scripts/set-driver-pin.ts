import { config } from 'dotenv';
config();
config({ path: '.env.local', override: true });

const TEST_USER_ID = '877ddf10-efd5-4dcd-9ce5-a8c7de3c7044';
const PIN = '1234';

async function main() {
  // Dynamic imports so dotenv runs first (ES imports are hoisted otherwise)
  const bcrypt = (await import('bcryptjs')).default;
  const { prisma } = await import('../lib/db');

  const hash = await bcrypt.hash(PIN, 10);
  await prisma.user.update({ where: { id: TEST_USER_ID }, data: { pin: hash } });
  console.log(`PIN set to ${PIN} for user ${TEST_USER_ID}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
