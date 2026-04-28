import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Load .env first, then .env.local (which takes precedence)
config();
config({ path: ".env.local", override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
