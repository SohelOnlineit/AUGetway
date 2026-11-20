-- CreateTable
CREATE TABLE "product_seo" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "storefront" TEXT NOT NULL,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "seoImageUrl" TEXT,
    "canonicalPath" TEXT,
    "noindex" BOOLEAN NOT NULL DEFAULT false,
    "nofollow" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "product_seo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_seo_productId_storefront_key" ON "product_seo"("productId", "storefront");

-- CreateIndex
CREATE INDEX "product_seo_storefront_noindex_idx" ON "product_seo"("storefront", "noindex");

-- AddForeignKey
ALTER TABLE "product_seo" ADD CONSTRAINT "product_seo_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep the current product SEO as the AmarPin listing.
INSERT INTO "product_seo" ("id", "productId", "storefront", "seoTitle", "seoDescription", "seoImageUrl", "noindex", "nofollow")
SELECT gen_random_uuid()::text, "id", 'amarpin', "seoTitle", "seoDescription", "seoImageUrl", "noindex", false
FROM "products"
WHERE "seoTitle" IS NOT NULL
   OR "seoDescription" IS NOT NULL
   OR "seoImageUrl" IS NOT NULL
   OR "noindex" = true;
