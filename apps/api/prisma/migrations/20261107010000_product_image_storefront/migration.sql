-- AlterTable
ALTER TABLE "product_images" ADD COLUMN "storefront" TEXT NOT NULL DEFAULT 'amarpin';

-- CreateIndex
CREATE INDEX "product_images_productId_storefront_sortOrder_idx" ON "product_images"("productId", "storefront", "sortOrder");

-- DropIndex
DROP INDEX "product_images_productId_sortOrder_idx";
