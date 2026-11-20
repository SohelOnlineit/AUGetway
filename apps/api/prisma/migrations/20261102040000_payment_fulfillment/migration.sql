-- AlterEnum OrderStatus
ALTER TYPE "OrderStatus" ADD VALUE 'PAID';
ALTER TYPE "OrderStatus" ADD VALUE 'FULFILLED';

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');
CREATE TYPE "PaymentProvider" AS ENUM ('SANDBOX');
CREATE TYPE "PaymentIntentStatus" AS ENUM ('REQUIRES_CONFIRMATION', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "PaymentEventKind" AS ENUM ('INTENT_CREATED', 'SANDBOX_SIMULATE', 'PROVIDER_CALLBACK', 'VERIFIED', 'FAILED', 'EXPIRED', 'DUPLICATE_IGNORED', 'SETTLED');

-- AlterTable orders
ALTER TABLE "orders" ADD COLUMN "fulfillmentStatus" "FulfillmentStatus" NOT NULL DEFAULT 'NOT_STARTED';
ALTER TABLE "orders" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "fulfilledAt" TIMESTAMP(3);

CREATE INDEX "orders_status_fulfillmentStatus_idx" ON "orders"("status", "fulfillmentStatus");

-- CreateTable order_status_history
CREATE TABLE "order_status_history" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_status_history_orderId_createdAt_idx" ON "order_status_history"("orderId", "createdAt");
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable order_deliveries
CREATE TABLE "order_deliveries" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "titleSnapshot" TEXT NOT NULL,
    "codeCiphertext" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_deliveries_inventoryItemId_key" ON "order_deliveries"("inventoryItemId");
CREATE INDEX "order_deliveries_orderId_idx" ON "order_deliveries"("orderId");
CREATE INDEX "order_deliveries_orderItemId_idx" ON "order_deliveries"("orderItemId");
ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable payment_intents
CREATE TABLE "payment_intents" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'SANDBOX',
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'REQUIRES_CONFIRMATION',
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "idempotencyKey" TEXT NOT NULL,
    "externalRef" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "succeededAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_intents_orderId_idempotencyKey_key" ON "payment_intents"("orderId", "idempotencyKey");
CREATE UNIQUE INDEX "payment_intents_provider_externalRef_key" ON "payment_intents"("provider", "externalRef");
CREATE INDEX "payment_intents_orderId_status_idx" ON "payment_intents"("orderId", "status");
CREATE INDEX "payment_intents_status_expiresAt_idx" ON "payment_intents"("status", "expiresAt");
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable payment_events
CREATE TABLE "payment_events" (
    "id" TEXT NOT NULL,
    "paymentIntentId" TEXT NOT NULL,
    "kind" "PaymentEventKind" NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_events_paymentIntentId_providerEventId_key" ON "payment_events"("paymentIntentId", "providerEventId");
CREATE INDEX "payment_events_paymentIntentId_createdAt_idx" ON "payment_events"("paymentIntentId", "createdAt");
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "payment_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
