import type {
  AdminTicketDetail,
  AdminTicketListItem,
  PublicTicketDetail,
  PublicTicketListItem,
  PublicTicketMessage,
} from "@amarpin/types";
import { isStaffRole, type RoleName } from "@amarpin/types";
import type {
  Ticket,
  TicketMessage,
  User,
} from "../../generated/prisma/client";

type TicketWithCount = Ticket & {
  _count?: { messages: number };
  chatRoom?: { id: string } | null;
  user?: Pick<User, "id" | "email" | "displayName" | "roles">;
  assignee?: Pick<User, "id" | "email" | "displayName"> | null;
};

export function mapTicketMessage(
  message: TicketMessage & {
    author: Pick<User, "id" | "displayName" | "roles">;
  },
): PublicTicketMessage {
  const roles = message.author.roles as RoleName[];
  return {
    id: message.id,
    authorUserId: message.authorUserId,
    authorDisplayName: message.author.displayName,
    authorIsStaff: roles.some((role) => isStaffRole(role)),
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  };
}

export function mapPublicTicketListItem(
  ticket: TicketWithCount,
): PublicTicketListItem {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    assignedToUserId: ticket.assignedToUserId,
    messageCount: ticket._count?.messages ?? 0,
    chatRoomId: ticket.chatRoom?.id ?? null,
    updatedAt: ticket.updatedAt.toISOString(),
    createdAt: ticket.createdAt.toISOString(),
  };
}

export function mapPublicTicketDetail(
  ticket: TicketWithCount & {
    messages: Array<
      TicketMessage & { author: Pick<User, "id" | "displayName" | "roles"> }
    >;
  },
): PublicTicketDetail {
  return {
    ...mapPublicTicketListItem(ticket),
    messages: ticket.messages.map(mapTicketMessage),
    closedAt: ticket.closedAt?.toISOString() ?? null,
  };
}

export function mapAdminTicketListItem(
  ticket: TicketWithCount,
): AdminTicketListItem {
  return {
    ...mapPublicTicketListItem(ticket),
    customerId: ticket.userId,
    customerEmail: ticket.user?.email ?? "",
    assigneeEmail: ticket.assignee?.email ?? null,
  };
}

export function mapAdminTicketDetail(
  ticket: TicketWithCount & {
    messages: Array<
      TicketMessage & { author: Pick<User, "id" | "displayName" | "roles"> }
    >;
  },
): AdminTicketDetail {
  return {
    ...mapAdminTicketListItem(ticket),
    messages: ticket.messages.map(mapTicketMessage),
    closedAt: ticket.closedAt?.toISOString() ?? null,
  };
}
