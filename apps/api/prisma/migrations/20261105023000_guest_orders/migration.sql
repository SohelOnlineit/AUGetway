ALTER TABLE "users" ADD COLUMN "isGuest" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "guestToken" TEXT;
CREATE UNIQUE INDEX "users_guestToken_key" ON "users"("guestToken");

ALTER TABLE "orders" ADD COLUMN "contactName" TEXT;
ALTER TABLE "orders" ADD COLUMN "contactPhone" TEXT;
ALTER TABLE "orders" ADD COLUMN "contactEmail" TEXT;
