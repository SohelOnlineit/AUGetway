-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN "packageValueId" TEXT;

-- CreateIndex
CREATE INDEX "inventory_items_productId_packageValueId_status_idx" ON "inventory_items"("productId", "packageValueId", "status");
