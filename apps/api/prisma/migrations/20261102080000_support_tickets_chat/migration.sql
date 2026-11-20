-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'PUSH');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SKIPPED_NO_PROVIDER', 'FAILED', 'ACCEPTED');
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED');
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "ChatRoomStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "ChatParticipantRole" AS ENUM ('CUSTOMER', 'STAFF');

-- AlterTable notifications
ALTER TABLE "notifications" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'general';
ALTER TABLE "notifications" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "notifications_userId_kind_idempotencyKey_key"
  ON "notifications"("userId", "kind", "idempotencyKey");

-- CreateTable notification_deliveries
CREATE TABLE "notification_deliveries" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "failureReason" TEXT,
    "attemptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_deliveries_notificationId_channel_key"
  ON "notification_deliveries"("notificationId", "channel");
CREATE INDEX "notification_deliveries_status_createdAt_idx"
  ON "notification_deliveries"("status", "createdAt");
ALTER TABLE "notification_deliveries"
  ADD CONSTRAINT "notification_deliveries_notificationId_fkey"
  FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ticket number sequence
CREATE TABLE "ticket_number_sequences" (
    "id" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1000,
    CONSTRAINT "ticket_number_sequences_pkey" PRIMARY KEY ("id")
);

-- Tickets
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "assignedToUserId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tickets_subject_len" CHECK (char_length("subject") >= 4 AND char_length("subject") <= 200)
);

CREATE UNIQUE INDEX "tickets_ticketNumber_key" ON "tickets"("ticketNumber");
CREATE UNIQUE INDEX "tickets_userId_idempotencyKey_key" ON "tickets"("userId", "idempotencyKey");
CREATE INDEX "tickets_status_updatedAt_idx" ON "tickets"("status", "updatedAt");
CREATE INDEX "tickets_assignedToUserId_status_idx" ON "tickets"("assignedToUserId", "status");
CREATE INDEX "tickets_userId_createdAt_idx" ON "tickets"("userId", "createdAt");
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignedToUserId_fkey"
  FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Ticket messages
CREATE TABLE "ticket_messages" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ticket_messages_body_len" CHECK (char_length("body") >= 1 AND char_length("body") <= 4000)
);

CREATE UNIQUE INDEX "ticket_messages_ticketId_idempotencyKey_key"
  ON "ticket_messages"("ticketId", "idempotencyKey");
CREATE INDEX "ticket_messages_ticketId_createdAt_idx"
  ON "ticket_messages"("ticketId", "createdAt");
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Chat rooms
CREATE TABLE "chat_rooms" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT,
    "customerUserId" TEXT NOT NULL,
    "status" "ChatRoomStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chat_rooms_ticketId_key" ON "chat_rooms"("ticketId");
CREATE INDEX "chat_rooms_customerUserId_updatedAt_idx" ON "chat_rooms"("customerUserId", "updatedAt");
CREATE INDEX "chat_rooms_status_updatedAt_idx" ON "chat_rooms"("status", "updatedAt");
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_customerUserId_fkey"
  FOREIGN KEY ("customerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Chat participants
CREATE TABLE "chat_room_participants" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ChatParticipantRole" NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_room_participants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chat_room_participants_roomId_userId_key"
  ON "chat_room_participants"("roomId", "userId");
CREATE INDEX "chat_room_participants_userId_idx" ON "chat_room_participants"("userId");
ALTER TABLE "chat_room_participants" ADD CONSTRAINT "chat_room_participants_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_room_participants" ADD CONSTRAINT "chat_room_participants_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Chat messages (text-only)
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chat_messages_body_len" CHECK (char_length("body") >= 1 AND char_length("body") <= 2000)
);

CREATE UNIQUE INDEX "chat_messages_roomId_idempotencyKey_key"
  ON "chat_messages"("roomId", "idempotencyKey");
CREATE INDEX "chat_messages_roomId_createdAt_idx" ON "chat_messages"("roomId", "createdAt");
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_senderUserId_fkey"
  FOREIGN KEY ("senderUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
