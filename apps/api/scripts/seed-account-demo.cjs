#!/usr/bin/env node
/**
 * Development-only account demo seed (notifications + empty wallet ensure).
 * Refuses production. Does not credit wallets.
 */
const { resolve } = require("node:path");
require("dotenv").config({ path: resolve(process.cwd(), "../../.env") });
require("dotenv").config({ path: resolve(process.cwd(), ".env") });
const { PrismaPg } = require("@prisma/adapter-pg");
let PrismaClient;
try {
  ({ PrismaClient } = require("../dist/generated/prisma/client"));
} catch {
  ({ PrismaClient } = require("../src/generated/prisma/client"));
}

const nodeEnv = process.env.NODE_ENV ?? "development";

async function main() {
  if (nodeEnv === "production") {
    throw new Error("Refusing to seed account demo in production");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const email = process.env.DEV_SEED_CUSTOMER_EMAIL?.trim().toLowerCase();
  if (!email) {
    throw new Error("DEV_SEED_CUSTOMER_EMAIL is required for account demo seed");
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new Error(`Customer not found for ${email}. Run seed:identity first.`);
    }

    await prisma.wallet.upsert({
      where: { userId: user.id },
      create: { userId: user.id, currency: "BDT", balanceMinor: 0, version: 0 },
      update: {},
    });

    await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });

    const existing = await prisma.notification.count({
      where: { userId: user.id, title: "Welcome to your dashboard" },
    });
    if (existing === 0) {
      await prisma.notification.create({
        data: {
          userId: user.id,
          title: "Welcome to your dashboard",
          body: "Track orders, wishlist, and your read-only wallet from Account.",
          href: "/dashboard",
        },
      });
    }

    console.log(`Account demo seed completed for ${email} (wallet remains 0).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
