-- AlterEnum OrderStatus
ALTER TYPE "OrderStatus" ADD VALUE 'PARTIALLY_REFUNDED';
ALTER TYPE "OrderStatus" ADD VALUE 'REFUNDED';

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "RefundDestination" AS ENUM ('ORIGINAL_PROVIDER', 'WALLET');

-- AlterTable orders
ALTER TABLE "orders" ADD COLUMN "refundedMinor" INTEGER NOT NULL DEFAULT 0;

-- CreateTable refunds
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentIntentId" TEXT,
    "userId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "destination" "RefundDestination" NOT NULL DEFAULT 'ORIGINAL_PROVIDER',
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "providerRef" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "processedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "refunds_amount_positive" CHECK ("amountMinor" > 0)
);

CREATE UNIQUE INDEX "refunds_orderId_idempotencyKey_key" ON "refunds"("orderId", "idempotencyKey");
CREATE INDEX "refunds_userId_createdAt_idx" ON "refunds"("userId", "createdAt");
CREATE INDEX "refunds_status_createdAt_idx" ON "refunds"("status", "createdAt");
CREATE INDEX "refunds_paymentIntentId_idx" ON "refunds"("paymentIntentId");
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable refund_status_history
CREATE TABLE "refund_status_history" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "fromStatus" "RefundStatus",
    "toStatus" "RefundStatus" NOT NULL,
    "actorUserId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refund_status_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "refund_status_history_refundId_createdAt_idx" ON "refund_status_history"("refundId", "createdAt");
ALTER TABLE "refund_status_history" ADD CONSTRAINT "refund_status_history_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "refunds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
