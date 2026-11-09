DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'InboxNotice'
  ) THEN
    ALTER TABLE "InboxNotice" ADD COLUMN IF NOT EXISTS "receivedKey" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "InboxNotice_handsetId_receivedKey_key"
      ON "InboxNotice" ("handsetId", "receivedKey");
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Handset'
  ) THEN
    CREATE TABLE IF NOT EXISTS "OutboundSms" (
      "id" TEXT NOT NULL,
      "handsetId" TEXT NOT NULL,
      "toNumber" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "simSlot" INTEGER NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'queued',
      "error" TEXT NOT NULL DEFAULT '',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "OutboundSms_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "OutboundSms_handsetId_fkey" FOREIGN KEY ("handsetId") REFERENCES "Handset"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  END IF;
END $$;
