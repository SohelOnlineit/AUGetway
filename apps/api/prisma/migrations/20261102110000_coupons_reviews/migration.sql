-- AlterTable
ALTER TABLE "products" ADD COLUMN "ratingCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "products" ADD COLUMN "ratingSum" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "discountMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN "couponId" TEXT;
ALTER TABLE "orders" ADD COLUMN "couponCode" TEXT;

-- CreateEnum
CREATE TYPE "CouponDiscountType" AS ENUM ('PERCENT', 'FIXED');
CREATE TYPE "CouponRedemptionStatus" AS ENUM ('HELD', 'CONSUMED', 'RELEASED');
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" "CouponDiscountType" NOT NULL,
    "percent" INTEGER,
    "amountMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "maxRedemptions" INTEGER,
    "maxPerCustomer" INTEGER,
    "minSubtotalMinor" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coupon_products" (
    "couponId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    CONSTRAINT "coupon_products_pkey" PRIMARY KEY ("couponId","productId")
);

CREATE TABLE "coupon_categories" (
    "couponId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    CONSTRAINT "coupon_categories_pkey" PRIMARY KEY ("couponId","categoryId")
);

CREATE TABLE "coupon_redemptions" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "CouponRedemptionStatus" NOT NULL DEFAULT 'HELD',
    "discountMinor" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_reviews" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "product_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");
CREATE INDEX "coupons_isActive_startsAt_endsAt_idx" ON "coupons"("isActive", "startsAt", "endsAt");
CREATE UNIQUE INDEX "coupon_redemptions_orderId_key" ON "coupon_redemptions"("orderId");
CREATE INDEX "coupon_redemptions_couponId_status_idx" ON "coupon_redemptions"("couponId", "status");
CREATE INDEX "coupon_redemptions_userId_couponId_status_idx" ON "coupon_redemptions"("userId", "couponId", "status");
CREATE UNIQUE INDEX "product_reviews_productId_userId_key" ON "product_reviews"("productId", "userId");
CREATE INDEX "product_reviews_productId_status_idx" ON "product_reviews"("productId", "status");
CREATE INDEX "product_reviews_status_createdAt_idx" ON "product_reviews"("status", "createdAt");

ALTER TABLE "orders" ADD CONSTRAINT "orders_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "coupon_products" ADD CONSTRAINT "coupon_products_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coupon_products" ADD CONSTRAINT "coupon_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coupon_categories" ADD CONSTRAINT "coupon_categories_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coupon_categories" ADD CONSTRAINT "coupon_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coupons" ADD CONSTRAINT "coupons_percent_range" CHECK ("percent" IS NULL OR ("percent" >= 1 AND "percent" <= 100));
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_rating_range" CHECK ("rating" >= 1 AND "rating" <= 5);
