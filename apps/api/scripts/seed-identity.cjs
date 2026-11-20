#!/usr/bin/env node
/**
 * Identity seed — credentials MUST come from environment variables.
 * No default / hardcoded passwords.
 *
 * Required:
 *   ADMIN_SEED_EMAIL, ADMIN_SEED_PASSWORD
 *
 * Optional (development only):
 *   DEV_SEED_CUSTOMER_EMAIL, DEV_SEED_CUSTOMER_PASSWORD
 *
 * Production additionally requires ALLOW_ADMIN_SEED=true
 */
const { createHash, randomBytes } = require("node:crypto");
const { resolve } = require("node:path");
require("dotenv").config({ path: resolve(process.cwd(), "../../.env") });
require("dotenv").config({ path: resolve(process.cwd(), ".env") });
const bcrypt = require("bcryptjs");
const { PrismaPg } = require("@prisma/adapter-pg");
// Prefer compiled client (Prisma generates TS under src/; seeds run via node).
let PrismaClient;
let Role;
let UserStatus;
try {
  ({ PrismaClient, Role, UserStatus } = require("../dist/generated/prisma/client"));
} catch {
  ({ PrismaClient, Role, UserStatus } = require("../src/generated/prisma/client"));
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const allowAdminSeed = process.env.ALLOW_ADMIN_SEED === "true";

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for seeding`);
  }
  return value;
}

function assertPassword(name, value) {
  if (value.length < 10) {
    throw new Error(`${name} must be at least 10 characters`);
  }
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value)) {
    throw new Error(`${name} must include uppercase, lowercase, and a number`);
  }
}

async function upsertUser(prisma, input) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  const passwordHash = await bcrypt.hash(input.password, 12);
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        roles: input.roles,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        displayName: input.displayName,
      },
    });
    return { id: existing.id, created: false };
  }
  const created = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      roles: input.roles,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      displayName: input.displayName,
    },
  });
  return { id: created.id, created: true };
}

async function main() {
  if (nodeEnv === "production" && !allowAdminSeed) {
    throw new Error(
      "Refusing to seed in production without ALLOW_ADMIN_SEED=true",
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const adminEmail = requireEnv("ADMIN_SEED_EMAIL").toLowerCase();
  const adminPassword = requireEnv("ADMIN_SEED_PASSWORD");
  assertPassword("ADMIN_SEED_PASSWORD", adminPassword);

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    const admin = await upsertUser(prisma, {
      email: adminEmail,
      password: adminPassword,
      roles: [Role.ADMINISTRATOR],
      displayName: "Administrator",
    });
    console.log(
      `Admin seed ${admin.created ? "created" : "updated"} id=${admin.id}`,
    );

    await prisma.auditEvent.create({
      data: {
        userId: admin.id,
        action: "seed.admin",
        metadata: { created: admin.created },
        ipHash: createHash("sha256")
          .update(`seed:${randomBytes(8).toString("hex")}`)
          .digest("hex"),
      },
    });

    if (nodeEnv !== "production") {
      const customerEmail = process.env.DEV_SEED_CUSTOMER_EMAIL?.trim();
      const customerPassword = process.env.DEV_SEED_CUSTOMER_PASSWORD?.trim();
      if (customerEmail && customerPassword) {
        assertPassword("DEV_SEED_CUSTOMER_PASSWORD", customerPassword);
        const customer = await upsertUser(prisma, {
          email: customerEmail.toLowerCase(),
          password: customerPassword,
          roles: [Role.CUSTOMER],
          displayName: "Dev Customer",
        });
        console.log(
          `Dev customer seed ${customer.created ? "created" : "updated"} id=${customer.id}`,
        );
      } else {
        console.log(
          "Skipping fake customer seed (set DEV_SEED_CUSTOMER_EMAIL/PASSWORD to enable)",
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
