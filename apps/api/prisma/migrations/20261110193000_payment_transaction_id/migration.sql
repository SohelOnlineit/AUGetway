ALTER TABLE "payment_intents" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE "payment_intents" ADD COLUMN IF NOT EXISTS "transactionId" TEXT;
