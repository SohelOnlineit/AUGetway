ALTER TABLE "users" ADD COLUMN "storefront" TEXT NOT NULL DEFAULT 'amarpin';
ALTER TABLE "orders" ADD COLUMN "storefront" TEXT NOT NULL DEFAULT 'amarpin';
ALTER TABLE "contact_inquiries" ADD COLUMN "storefront" TEXT NOT NULL DEFAULT 'amarpin';
ALTER TABLE "product_requests" ADD COLUMN "storefront" TEXT NOT NULL DEFAULT 'amarpin';
