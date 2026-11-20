import type { AdminPage } from "./admin";

export type TicketStatusPublic =
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING_CUSTOMER"
  | "RESOLVED"
  | "CLOSED";

export type TicketPriorityPublic = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type ChatRoomStatusPublic = "OPEN" | "CLOSED";

export type ChatParticipantRolePublic = "CUSTOMER" | "STAFF";

export type NotificationChannelPublic = "IN_APP" | "EMAIL" | "PUSH";

export type NotificationDeliveryStatusPublic =
  | "PENDING"
  | "SKIPPED_NO_PROVIDER"
  | "FAILED"
  | "ACCEPTED";

export interface PublicNotificationDelivery {
  channel: NotificationChannelPublic;
  status: NotificationDeliveryStatusPublic;
  provider: string | null;
  failureReason: string | null;
  attemptedAt: string | null;
}

export interface PublicTicketMessage {
  id: string;
  authorUserId: string;
  authorDisplayName: string | null;
  authorIsStaff: boolean;
  body: string;
  createdAt: string;
}

export interface PublicTicketListItem {
  id: string;
  ticketNumber: string;
  subject: string;
  status: TicketStatusPublic;
  priority: TicketPriorityPublic;
  assignedToUserId: string | null;
  messageCount: number;
  chatRoomId: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface PublicTicketDetail extends PublicTicketListItem {
  messages: PublicTicketMessage[];
  closedAt: string | null;
}

export interface AdminTicketListItem extends PublicTicketListItem {
  customerId: string;
  customerEmail: string;
  assigneeEmail: string | null;
}

export interface AdminTicketDetail extends AdminTicketListItem {
  messages: PublicTicketMessage[];
  closedAt: string | null;
}

export type AdminTicketPage = AdminPage<AdminTicketListItem>;

export interface PublicChatMessage {
  id: string;
  roomId: string;
  senderUserId: string;
  senderDisplayName: string | null;
  senderIsStaff: boolean;
  body: string;
  imageUrl: string | null;
  createdAt: string;
}

export interface PublicChatRoomSummary {
  id: string;
  ticketId: string | null;
  ticketNumber: string | null;
  status: ChatRoomStatusPublic;
  customerUserId: string;
  updatedAt: string;
  createdAt: string;
  lastMessage: PublicChatMessage | null;
}

export interface PublicChatRoomDetail extends PublicChatRoomSummary {
  messages: PublicChatMessage[];
  participants: Array<{
    userId: string;
    role: ChatParticipantRolePublic;
    lastReadAt: string | null;
    lastSeenAt: string | null;
  }>;
}

export interface AdminChatRoomListItem extends PublicChatRoomSummary {
  customerEmail: string;
  customerDisplayName: string | null;
  customerOnline: boolean;
  unreadCount: number;
}

export type AdminChatRoomPage = AdminPage<AdminChatRoomListItem>;

/** Socket.IO `/chat` client → server events. */
export const ChatClientEvent = {
  JoinRoom: "chat.room.join",
  LeaveRoom: "chat.room.leave",
  SendMessage: "chat.message.send",
  TypingStart: "chat.typing.start",
  TypingStop: "chat.typing.stop",
  MarkRead: "chat.read",
  PresencePing: "chat.presence.ping",
} as const;

/** Socket.IO `/chat` server → client events. */
export const ChatServerEvent = {
  Message: "chat.message",
  Typing: "chat.typing",
  Presence: "chat.presence",
  Read: "chat.read",
  Error: "chat.error",
  Joined: "chat.room.joined",
  DeskPresence: "chat.desk.presence",
  DeskMessage: "chat.desk.message",
  DeskRead: "chat.desk.read",
} as const;

export type ChatClientEvent =
  (typeof ChatClientEvent)[keyof typeof ChatClientEvent];
export type ChatServerEvent =
  (typeof ChatServerEvent)[keyof typeof ChatServerEvent];
