import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Load .env first, then .env.local (which takes precedence)
config();
config({ path: ".env.local", override: true });

// Migrations use the DIRECT_URL (port 5432, unpooled). At runtime, the
// PrismaPg adapter in lib/db.ts uses DATABASE_URL (pooled, port 6543).
// Prisma 7 requires this split because PgBouncer in transaction mode
// breaks the prepared statements migrations rely on.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
