-- AlterTable users
ALTER TABLE "users" ADD COLUMN "adminNote" TEXT;

-- AlterTable audit_events
ALTER TABLE "audit_events" ADD COLUMN "entityType" TEXT;
ALTER TABLE "audit_events" ADD COLUMN "entityId" TEXT;

CREATE INDEX "audit_events_entityType_entityId_createdAt_idx"
  ON "audit_events"("entityType", "entityId", "createdAt");
