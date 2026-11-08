import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";
import { resolve } from "node:path";

loadEnv({ path: resolve(__dirname, "../../.env") });
loadEnv({ path: resolve(__dirname, ".env") });

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://uniqpay:uniqpay_local@127.0.0.1:5433/uniqpay?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
