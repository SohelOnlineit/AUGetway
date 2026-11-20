import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";
import { resolve } from "node:path";

// Load monorepo root .env then local overrides (no secrets committed).
loadEnv({ path: resolve(__dirname, "../../.env") });
loadEnv({ path: resolve(__dirname, ".env") });

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/amarpin?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
