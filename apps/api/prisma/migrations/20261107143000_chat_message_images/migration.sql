-- Staff can attach one photo to a live chat message.
ALTER TABLE "chat_messages" ADD COLUMN "imageUrl" TEXT;
