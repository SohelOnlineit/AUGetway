-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('LICENSE', 'ACCOUNT', 'GIFTCARD', 'TOPUP', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "HomepageSectionType" AS ENUM ('FEATURED_PRODUCTS', 'CATEGORY_PRODUCTS', 'LATEST_PRODUCTS');

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "path" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "depth" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "imageUrl" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleNormalized" TEXT NOT NULL,
    "description" TEXT,
    "shortDescription" TEXT,
    "sku" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "type" "ProductType" NOT NULL,
    "categoryId" TEXT NOT NULL,
    "brandId" TEXT,
    "priceMinor" INTEGER NOT NULL,
    "compareAtMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homepage_slides" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "imageUrl" TEXT NOT NULL,
    "linkUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homepage_slides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homepage_sections" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "HomepageSectionType" NOT NULL,
    "categoryId" TEXT,
    "productLimit" INTEGER NOT NULL DEFAULT 8,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homepage_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "navigation_items" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "navigation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_content_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'default',
    "siteName" TEXT NOT NULL DEFAULT 'UniQbd',
    "tagline" TEXT,
    "defaultSeoTitle" TEXT,
    "defaultSeoDescription" TEXT,
    "canonicalBaseUrl" TEXT,
    "robotsExtra" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_content_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");
CREATE INDEX "categories_isActive_sortOrder_idx" ON "categories"("isActive", "sortOrder");
CREATE INDEX "categories_parentId_idx" ON "categories"("parentId");

CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");
CREATE INDEX "brands_isActive_sortOrder_idx" ON "brands"("isActive", "sortOrder");

CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
CREATE INDEX "products_status_createdAt_idx" ON "products"("status", "createdAt");
CREATE INDEX "products_status_featured_sortOrder_idx" ON "products"("status", "featured", "sortOrder");
CREATE INDEX "products_status_categoryId_createdAt_idx" ON "products"("status", "categoryId", "createdAt");
CREATE INDEX "products_status_brandId_createdAt_idx" ON "products"("status", "brandId", "createdAt");
CREATE INDEX "products_status_titleNormalized_idx" ON "products"("status", "titleNormalized");
CREATE INDEX "products_status_priceMinor_idx" ON "products"("status", "priceMinor");

CREATE INDEX "product_images_productId_sortOrder_idx" ON "product_images"("productId", "sortOrder");
CREATE INDEX "homepage_slides_isActive_sortOrder_idx" ON "homepage_slides"("isActive", "sortOrder");
CREATE INDEX "homepage_sections_isActive_sortOrder_idx" ON "homepage_sections"("isActive", "sortOrder");
CREATE INDEX "navigation_items_isActive_sortOrder_idx" ON "navigation_items"("isActive", "sortOrder");
CREATE UNIQUE INDEX "site_content_settings_key_key" ON "site_content_settings"("key");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homepage_sections" ADD CONSTRAINT "homepage_sections_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
