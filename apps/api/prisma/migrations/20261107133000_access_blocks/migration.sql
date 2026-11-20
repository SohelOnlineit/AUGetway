-- IP and country deny rules enforced before shop API handlers.
CREATE TYPE "AccessBlockKind" AS ENUM ('IP', 'COUNTRY');

CREATE TABLE "access_blocks" (
  "id" TEXT NOT NULL,
  "type" "AccessBlockKind" NOT NULL,
  "value" TEXT NOT NULL,
  "reason" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "access_blocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "access_blocks_type_value_key" ON "access_blocks"("type", "value");
CREATE INDEX "access_blocks_active_type_idx" ON "access_blocks"("active", "type");
