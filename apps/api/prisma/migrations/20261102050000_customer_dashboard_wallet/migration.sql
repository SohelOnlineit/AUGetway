-- AlterTable users
ALTER TABLE "users" ADD COLUMN "phone" TEXT;

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE "WalletTransactionStatus" AS ENUM ('POSTED');

-- CreateTable wallets
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "balanceMinor" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wallets_balanceMinor_non_negative" CHECK ("balanceMinor" >= 0)
);

CREATE UNIQUE INDEX "wallets_userId_key" ON "wallets"("userId");
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable wallet_transactions (immutable ledger)
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "balanceAfterMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "status" "WalletTransactionStatus" NOT NULL DEFAULT 'POSTED',
    "referenceType" TEXT,
    "referenceId" TEXT,
    "description" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wallet_transactions_amount_positive" CHECK ("amountMinor" > 0),
    CONSTRAINT "wallet_transactions_balance_non_negative" CHECK ("balanceAfterMinor" >= 0)
);

CREATE UNIQUE INDEX "wallet_transactions_walletId_idempotencyKey_key" ON "wallet_transactions"("walletId", "idempotencyKey");
CREATE INDEX "wallet_transactions_walletId_createdAt_idx" ON "wallet_transactions"("walletId", "createdAt");
CREATE INDEX "wallet_transactions_referenceType_referenceId_idx" ON "wallet_transactions"("referenceType", "referenceId");
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable wishlist_items
CREATE TABLE "wishlist_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wishlist_items_userId_productId_key" ON "wishlist_items"("userId", "productId");
CREATE INDEX "wishlist_items_userId_createdAt_idx" ON "wishlist_items"("userId", "createdAt");
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable notifications
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable notification_preferences
CREATE TABLE "notification_preferences" (
    "userId" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Revoke direct UPDATE/DELETE on ledger from application role is host-specific;
-- immutability is enforced in WalletService (no update/delete APIs).
