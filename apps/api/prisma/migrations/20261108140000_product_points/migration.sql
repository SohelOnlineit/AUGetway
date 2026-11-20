ALTER TABLE "products" ADD COLUMN "pointSpendMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "products" ADD COLUMN "pointReward" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "point_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "point_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "point_accounts_userId_key" ON "point_accounts"("userId");

ALTER TABLE "point_accounts" ADD CONSTRAINT "point_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "point_entries" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "points" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "point_entries_idempotencyKey_key" ON "point_entries"("idempotencyKey");
CREATE INDEX "point_entries_userId_createdAt_idx" ON "point_entries"("userId", "createdAt");
CREATE INDEX "point_entries_orderId_idx" ON "point_entries"("orderId");

ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "point_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
