-- Privacy-conscious analytics (no PII / secrets / chat text)
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "visitorKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "analytics_events_name_allowlist" CHECK (
      "name" IN (
        'page_view',
        'product_view',
        'add_to_cart',
        'checkout_start',
        'search'
      )
    )
);

CREATE INDEX "analytics_events_name_createdAt_idx" ON "analytics_events"("name", "createdAt");
CREATE INDEX "analytics_events_createdAt_idx" ON "analytics_events"("createdAt");
