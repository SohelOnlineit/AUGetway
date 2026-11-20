#!/usr/bin/env node
/**
 * Development-only inventory seed (encrypted codes at rest).
 * Refuses production. Never prints plaintext codes.
 */
const { createCipheriv, createHash, randomBytes } = require("node:crypto");
const { resolve } = require("node:path");
require("dotenv").config({ path: resolve(process.cwd(), "../../.env") });
require("dotenv").config({ path: resolve(process.cwd(), ".env") });
const { PrismaPg } = require("@prisma/adapter-pg");
let PrismaClient;
let ProductStatus;
let InventoryStatus;
try {
  ({ PrismaClient, ProductStatus, InventoryStatus } = require("../dist/generated/prisma/client"));
} catch {
  ({ PrismaClient, ProductStatus, InventoryStatus } = require("../src/generated/prisma/client"));
}

const nodeEnv = process.env.NODE_ENV ?? "development";

function encryptionKey() {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) throw new Error("DATA_ENCRYPTION_KEY is required");
  const asBase64 = Buffer.from(raw, "base64");
  if (asBase64.length === 32) return asBase64;
  return createHash("sha256").update(raw, "utf8").digest();
}

function encryptSecret(plaintext) {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}:${encrypted.toString("base64url")}:${tag.toString("base64url")}`;
}

async function main() {
  if (nodeEnv === "production") {
    throw new Error("Refusing to seed inventory in production");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    const products = await prisma.product.findMany({
      where: { status: ProductStatus.ACTIVE },
      select: { id: true, slug: true },
    });
    if (products.length === 0) {
      throw new Error("No ACTIVE products found. Run seed:catalog first.");
    }

    await prisma.inventoryItem.deleteMany();

    let created = 0;
    for (const product of products) {
      for (let i = 1; i <= 8; i += 1) {
        const plaintext = `DEMO-${product.slug.toUpperCase()}-${String(i).padStart(3, "0")}-${randomBytes(3).toString("hex")}`;
        await prisma.inventoryItem.create({
          data: {
            productId: product.id,
            codeCiphertext: encryptSecret(plaintext),
            status: InventoryStatus.AVAILABLE,
          },
        });
        created += 1;
      }
    }

    console.log(
      `Inventory fake seed completed: ${created} encrypted units for ${products.length} products.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
