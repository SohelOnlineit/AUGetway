ALTER TABLE "orders" ADD COLUMN "trashedAt" TIMESTAMP(3);
CREATE INDEX "orders_trashedAt_idx" ON "orders"("trashedAt");
