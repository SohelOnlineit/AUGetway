-- CreateEnum
CREATE TYPE "BlogPostStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SitePageKey" AS ENUM ('ABOUT', 'CONTACT', 'PRIVACY', 'TERMS', 'REFUND_POLICY', 'DISCLAIMERS');

-- CreateEnum
CREATE TYPE "ContactInquiryStatus" AS ENUM ('NEW', 'READ', 'REPLIED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ContactMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "ContactReplyDeliveryStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'SKIPPED_NO_PROVIDER', 'FAILED', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "ProductRequestStatus" AS ENUM ('NEW', 'REVIEWING', 'REPLIED', 'CLOSED');

-- CreateTable
CREATE TABLE "blog_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_posts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT NOT NULL,
    "coverImagePath" TEXT,
    "status" "BlogPostStatus" NOT NULL DEFAULT 'DRAFT',
    "categoryId" TEXT,
    "authorUserId" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_pages" (
    "id" TEXT NOT NULL,
    "key" "SitePageKey" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_inquiries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "ContactInquiryStatus" NOT NULL DEFAULT 'NEW',
    "readAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_inquiry_messages" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "direction" "ContactMessageDirection" NOT NULL,
    "body" TEXT NOT NULL,
    "actorUserId" TEXT,
    "deliveryStatus" "ContactReplyDeliveryStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "deliveryDetail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_inquiry_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_requests" (
    "id" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "status" "ProductRequestStatus" NOT NULL DEFAULT 'NEW',
    "adminReply" TEXT,
    "replyDeliveryStatus" "ContactReplyDeliveryStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "replyDeliveryDetail" TEXT,
    "reviewedByUserId" TEXT,
    "repliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "blog_categories_slug_key" ON "blog_categories"("slug");

-- CreateIndex
CREATE INDEX "blog_categories_isActive_sortOrder_idx" ON "blog_categories"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "blog_posts_slug_key" ON "blog_posts"("slug");

-- CreateIndex
CREATE INDEX "blog_posts_status_publishedAt_idx" ON "blog_posts"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "blog_posts_categoryId_status_idx" ON "blog_posts"("categoryId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "site_pages_key_key" ON "site_pages"("key");

-- CreateIndex
CREATE INDEX "contact_inquiries_status_createdAt_idx" ON "contact_inquiries"("status", "createdAt");

-- CreateIndex
CREATE INDEX "contact_inquiries_email_createdAt_idx" ON "contact_inquiries"("email", "createdAt");

-- CreateIndex
CREATE INDEX "contact_inquiry_messages_inquiryId_createdAt_idx" ON "contact_inquiry_messages"("inquiryId", "createdAt");

-- CreateIndex
CREATE INDEX "product_requests_status_createdAt_idx" ON "product_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "product_requests_email_createdAt_idx" ON "product_requests"("email", "createdAt");

-- AddForeignKey
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "blog_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_inquiry_messages" ADD CONSTRAINT "contact_inquiry_messages_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "contact_inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default site pages (unpublished until edited)
INSERT INTO "site_pages" ("id", "key", "title", "body", "isPublished", "createdAt", "updatedAt") VALUES
  ('sp_about_default', 'ABOUT', 'About UniQbd', '', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sp_contact_default', 'CONTACT', 'Contact', '', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sp_privacy_default', 'PRIVACY', 'Privacy Policy', '', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sp_terms_default', 'TERMS', 'Terms & Conditions', '', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sp_refund_default', 'REFUND_POLICY', 'Refund & Returns Policy', '', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sp_disclaimers_default', 'DISCLAIMERS', 'Disclaimers', '', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
