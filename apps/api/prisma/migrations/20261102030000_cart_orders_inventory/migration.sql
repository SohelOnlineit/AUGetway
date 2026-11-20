-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD', 'DISABLED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'CANCELLED');

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "codeCiphertext" TEXT NOT NULL,
    "status" "InventoryStatus" NOT NULL DEFAULT 'AVAILABLE',
    "reservedOrderId" TEXT,
    "reservedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "subtotalMinor" INTEGER NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reservationExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "titleSnapshot" TEXT NOT NULL,
    "slugSnapshot" TEXT NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lineTotalMinor" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_number_sequences" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "nextValue" INTEGER NOT NULL DEFAULT 1000,

    CONSTRAINT "order_number_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_items_productId_status_idx" ON "inventory_items"("productId", "status");
CREATE INDEX "inventory_items_reservedOrderId_idx" ON "inventory_items"("reservedOrderId");
CREATE INDEX "inventory_items_status_reservedUntil_idx" ON "inventory_items"("status", "reservedUntil");

CREATE UNIQUE INDEX "carts_userId_key" ON "carts"("userId");
CREATE UNIQUE INDEX "cart_items_cartId_productId_key" ON "cart_items"("cartId", "productId");
CREATE INDEX "cart_items_productId_idx" ON "cart_items"("productId");

CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");
CREATE UNIQUE INDEX "orders_userId_idempotencyKey_key" ON "orders"("userId", "idempotencyKey");
CREATE INDEX "orders_userId_createdAt_idx" ON "orders"("userId", "createdAt");
CREATE INDEX "orders_status_reservationExpiresAt_idx" ON "orders"("status", "reservationExpiresAt");

CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");
CREATE INDEX "order_items_productId_idx" ON "order_items"("productId");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_reservedOrderId_fkey" FOREIGN KEY ("reservedOrderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "carts" ADD CONSTRAINT "carts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "order_number_sequences" ("id", "nextValue") VALUES ('default', 1000)
ON CONFLICT ("id") DO NOTHING;
