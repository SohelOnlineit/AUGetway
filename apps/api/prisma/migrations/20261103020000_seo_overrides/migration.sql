-- AlterTable
ALTER TABLE "site_content_settings" ADD COLUMN "defaultOgImageUrl" TEXT;

-- AlterTable
ALTER TABLE "categories" ADD COLUMN "seoImageUrl" TEXT;
ALTER TABLE "categories" ADD COLUMN "noindex" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "brands" ADD COLUMN "seoImageUrl" TEXT;
ALTER TABLE "brands" ADD COLUMN "noindex" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "products" ADD COLUMN "seoImageUrl" TEXT;
ALTER TABLE "products" ADD COLUMN "noindex" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "blog_categories" ADD COLUMN "seoImageUrl" TEXT;
ALTER TABLE "blog_categories" ADD COLUMN "noindex" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "blog_posts" ADD COLUMN "seoImageUrl" TEXT;
ALTER TABLE "blog_posts" ADD COLUMN "noindex" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "site_pages" ADD COLUMN "seoImageUrl" TEXT;
ALTER TABLE "site_pages" ADD COLUMN "noindex" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "RouteSeoKey" AS ENUM ('HOME', 'PRODUCTS', 'BLOG', 'REQUEST_PRODUCT');

-- CreateTable
CREATE TABLE "route_seo" (
    "key" "RouteSeoKey" NOT NULL,
    "path" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "canonicalPath" TEXT,
    "noindex" BOOLEAN NOT NULL DEFAULT false,
    "nofollow" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_seo_pkey" PRIMARY KEY ("key")
);
