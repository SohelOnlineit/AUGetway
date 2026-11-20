import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import type {
  AdminChatRoomListItem,
  AdminPage,
  PublicChatMessage,
  PublicChatRoomDetail,
  PublicChatRoomSummary,
} from "@amarpin/types";
import { hasPermission, isStaffRole, type RoleName } from "@amarpin/types";
import {
  ChatParticipantRole,
  ChatRoomStatus,
  Prisma,
} from "../../generated/prisma/client";
import { ChatPresenceRegistry } from "./chat-presence";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../shared/audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { resolveStorefrontId } from "../catalog/storefronts";
import { TelegramService } from "../telegram/telegram.service";
import { RoleProfilesService } from "../storefront/role-profiles.service";
import { AdminPaginationQuery } from "../admin/dto/admin-common.dto";
import { IsEnum, IsOptional } from "class-validator";
import { CHAT_IMAGE_PATH } from "./dto/send-chat-message.dto";

const ROOM_SUMMARY_INCLUDE = {
  ticket: { select: { ticketNumber: true } },
  messages: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    include: {
      sender: { select: { id: true, displayName: true, roles: true } },
    },
  },
};

export class AdminChatRoomListQuery extends AdminPaginationQuery {
  @IsOptional()
  @IsEnum(ChatRoomStatus)
  status?: ChatRoomStatus;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly roles: RoleProfilesService,
    private readonly telegram: TelegramService,
    private readonly presence: ChatPresenceRegistry,
  ) {}

  async assertCanAccessRoom(
    userId: string,
    roles: RoleName[],
    roomId: string,
  ): Promise<{
    room: {
      id: string;
      customerUserId: string;
      status: ChatRoomStatus;
      ticketId: string | null;
    };
    isStaff: boolean;
  }> {
    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        customerUserId: true,
        status: true,
        ticketId: true,
      },
    });
    if (!room) throw new NotFoundException("Chat room not found");

    const isCustomer = room.customerUserId === userId;
    const isStaff =
      roles.some((role) => isStaffRole(role)) &&
      hasPermission(roles, "admin:chat:access");

    if (!isCustomer && !isStaff) {
      // Same shape as not found — avoid room existence oracle for strangers.
      throw new NotFoundException("Chat room not found");
    }

    return { room, isStaff };
  }

  async ensureParticipant(
    roomId: string,
    userId: string,
    role: ChatParticipantRole,
  ): Promise<void> {
    await this.prisma.chatRoomParticipant.upsert({
      where: { roomId_userId: { roomId, userId } },
      create: { roomId, userId, role, lastSeenAt: new Date() },
      update: { lastSeenAt: new Date() },
    });
  }

  async openSupportRoom(userId: string): Promise<PublicChatRoomSummary> {
    const existing = await this.prisma.chatRoom.findFirst({
      where: { customerUserId: userId, status: ChatRoomStatus.OPEN, ticketId: null },
      include: ROOM_SUMMARY_INCLUDE,
      orderBy: { updatedAt: "desc" },
    });
    if (existing) return this.mapRoomSummary(existing);

    const created = await this.prisma.chatRoom.create({
      data: {
        customerUserId: userId,
        status: ChatRoomStatus.OPEN,
        participants: {
          create: { userId, role: ChatParticipantRole.CUSTOMER },
        },
      },
      include: ROOM_SUMMARY_INCLUDE,
    });
    return this.mapRoomSummary(created);
  }

  async listRoomsForUser(userId: string): Promise<PublicChatRoomSummary[]> {
    const rows = await this.prisma.chatRoom.findMany({
      where: { customerUserId: userId },
      include: ROOM_SUMMARY_INCLUDE,
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    return rows.map((row) => this.mapRoomSummary(row));
  }

  async getRoomForUser(
    userId: string,
    roles: RoleName[],
    roomId: string,
    limit = 100,
  ): Promise<PublicChatRoomDetail> {
    await this.assertCanAccessRoom(userId, roles, roomId);
    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: {
        ticket: { select: { ticketNumber: true } },
        participants: true,
        messages: {
          orderBy: { createdAt: "asc" },
          take: Math.min(Math.max(limit, 1), 200),
          include: {
            sender: { select: { id: true, displayName: true, roles: true } },
          },
        },
      },
    });
    if (!room) throw new NotFoundException("Chat room not found");
    return {
      ...this.mapRoomSummary(room),
      messages: room.messages.map((msg) => this.mapMessage(msg)),
      participants: room.participants.map((p) => ({
        userId: p.userId,
        role: p.role,
        lastReadAt: p.lastReadAt?.toISOString() ?? null,
        lastSeenAt: p.lastSeenAt?.toISOString() ?? null,
      })),
    };
  }

  async listMessages(
    userId: string,
    roles: RoleName[],
    roomId: string,
    before?: string,
    limit = 50,
  ): Promise<PublicChatMessage[]> {
    await this.assertCanAccessRoom(userId, roles, roomId);
    const take = Math.min(Math.max(limit, 1), 100);
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        roomId,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
      include: {
        sender: { select: { id: true, displayName: true, roles: true } },
      },
    });
    return rows.reverse().map((msg) => this.mapMessage(msg));
  }

  async sendMessage(input: {
    userId: string;
    roles: RoleName[];
    roomId: string;
    body: string;
    imageUrl?: string | null;
    idempotencyKey: string;
    isGuest?: boolean;
    storefront?: string;
  }): Promise<PublicChatMessage> {
    const body = input.body.trim();
    const imageUrl = input.imageUrl?.trim() || null;
    const idempotencyKey = input.idempotencyKey.trim();
    if (imageUrl && !CHAT_IMAGE_PATH.test(imageUrl)) {
      throw new BadRequestException("Photo path is not allowed");
    }
    if (body.length > 2000) {
      throw new BadRequestException("Message body must be 1–2000 characters");
    }
    if (!body && !imageUrl) {
      throw new BadRequestException("Message body must be 1–2000 characters");
    }
    if (idempotencyKey.length < 8) {
      throw new BadRequestException("idempotencyKey is required");
    }

    const { room, isStaff } = await this.assertCanAccessRoom(
      input.userId,
      input.roles,
      input.roomId,
    );
    if (room.status === ChatRoomStatus.CLOSED) {
      throw new BadRequestException("Chat room is closed");
    }
    if (input.isGuest && !(await this.roles.guestLiveChatEnabled())) {
      throw new ForbiddenException("Live chat without an account is turned off. Please sign in.");
    }
    if (imageUrl && !(await this.roles.chatPicturesEnabled(input.roles, input.isGuest === true))) {
      throw new ForbiddenException("Picture uploads are turned off for this role");
    }

    const existing = await this.prisma.chatMessage.findUnique({
      where: {
        roomId_idempotencyKey: {
          roomId: input.roomId,
          idempotencyKey,
        },
      },
      include: {
        sender: { select: { id: true, displayName: true, roles: true } },
      },
    });
    if (existing) return this.mapMessage(existing);

    await this.ensureParticipant(
      input.roomId,
      input.userId,
      isStaff ? ChatParticipantRole.STAFF : ChatParticipantRole.CUSTOMER,
    );

    try {
      const created = await this.prisma.chatMessage.create({
        data: {
          roomId: input.roomId,
          senderUserId: input.userId,
          body,
          imageUrl,
          idempotencyKey,
        },
        include: {
          sender: { select: { id: true, displayName: true, roles: true } },
        },
      });
      const mapped = this.mapMessage(created);
      void this.afterMessageSaved({
        userId: input.userId,
        roomId: room.id,
        customerUserId: room.customerUserId,
        messageId: created.id,
        isStaff,
        body,
        imageUrl,
        idempotencyKey,
        storefront: input.storefront,
      });
      return mapped;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        const raced = await this.prisma.chatMessage.findUnique({
          where: {
            roomId_idempotencyKey: {
              roomId: input.roomId,
              idempotencyKey,
            },
          },
          include: {
            sender: { select: { id: true, displayName: true, roles: true } },
          },
        });
        if (raced) return this.mapMessage(raced);
      }
      throw error;
    }
  }

  async markRead(input: {
    userId: string;
    roles: RoleName[];
    roomId: string;
    at?: string;
  }): Promise<{ roomId: string; userId: string; lastReadAt: string }> {
    await this.assertCanAccessRoom(input.userId, input.roles, input.roomId);
    const at = input.at ? new Date(input.at) : new Date();
    if (Number.isNaN(at.getTime())) {
      throw new BadRequestException("Invalid read timestamp");
    }
    const { isStaff } = await this.assertCanAccessRoom(
      input.userId,
      input.roles,
      input.roomId,
    );
    await this.ensureParticipant(
      input.roomId,
      input.userId,
      isStaff ? ChatParticipantRole.STAFF : ChatParticipantRole.CUSTOMER,
    );
    const updated = await this.prisma.chatRoomParticipant.update({
      where: {
        roomId_userId: { roomId: input.roomId, userId: input.userId },
      },
      data: { lastReadAt: at, lastSeenAt: new Date() },
    });
    return {
      roomId: input.roomId,
      userId: input.userId,
      lastReadAt: updated.lastReadAt!.toISOString(),
    };
  }

  async touchPresence(input: {
    userId: string;
    roles: RoleName[];
    roomId: string;
  }): Promise<{ roomId: string; userId: string; lastSeenAt: string }> {
    const { isStaff } = await this.assertCanAccessRoom(
      input.userId,
      input.roles,
      input.roomId,
    );
    await this.ensureParticipant(
      input.roomId,
      input.userId,
      isStaff ? ChatParticipantRole.STAFF : ChatParticipantRole.CUSTOMER,
    );
    const updated = await this.prisma.chatRoomParticipant.update({
      where: {
        roomId_userId: { roomId: input.roomId, userId: input.userId },
      },
      data: { lastSeenAt: new Date() },
    });
    return {
      roomId: input.roomId,
      userId: input.userId,
      lastSeenAt: updated.lastSeenAt!.toISOString(),
    };
  }

  async adminListRooms(
    query: AdminChatRoomListQuery,
  ): Promise<AdminPage<AdminChatRoomListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ChatRoomWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { id: { equals: q } },
        { customer: { email: { contains: q, mode: "insensitive" } } },
        { customer: { displayName: { contains: q, mode: "insensitive" } } },
        { ticket: { ticketNumber: { contains: q, mode: "insensitive" } } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.chatRoom.count({ where }),
      this.prisma.chatRoom.findMany({
        where,
        include: {
          ticket: { select: { ticketNumber: true } },
          customer: { select: { email: true, displayName: true } },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              sender: { select: { id: true, displayName: true, roles: true } },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const unread = await this.unreadCustomerCounts(rows.map((row) => row.id));
    return {
      page,
      pageSize,
      total,
      items: rows.map((row) => ({
        ...this.mapRoomSummary(row),
        customerEmail: row.customer.email,
        customerDisplayName: row.customer.displayName,
        customerOnline: this.presence.isOnline(row.customerUserId),
        unreadCount: unread.get(row.id) ?? 0,
      })),
    };
  }

  /** Customer messages newer than the latest time a staff member opened the room. */
  private async unreadCustomerCounts(roomIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (roomIds.length === 0) return counts;
    const rows = await this.prisma.$queryRaw<Array<{ roomId: string; unread: number }>>`
      SELECT m."roomId" AS "roomId", COUNT(*)::int AS unread
      FROM "chat_messages" m
      INNER JOIN "chat_rooms" r ON r.id = m."roomId"
      LEFT JOIN (
        SELECT "roomId", MAX("lastReadAt") AS "readAt"
        FROM "chat_room_participants"
        WHERE role = 'STAFF' AND "roomId" IN (${Prisma.join(roomIds)})
        GROUP BY "roomId"
      ) s ON s."roomId" = m."roomId"
      WHERE m."roomId" IN (${Prisma.join(roomIds)})
        AND m."senderUserId" = r."customerUserId"
        AND (s."readAt" IS NULL OR m."createdAt" > s."readAt")
      GROUP BY m."roomId"
    `;
    for (const row of rows) {
      const unread = Number(row.unread);
      if (Number.isFinite(unread) && unread > 0) counts.set(row.roomId, Math.min(99, unread));
    }
    return counts;
  }

  roomSocketName(roomId: string): string {
    return `chat:room:${roomId}`;
  }

  private async afterMessageSaved(input: {
    userId: string;
    roomId: string;
    customerUserId: string;
    messageId: string;
    isStaff: boolean;
    body: string;
    imageUrl: string | null;
    idempotencyKey: string;
    storefront?: string;
  }) {
    try {
      await this.prisma.chatRoom.update({
        where: { id: input.roomId },
        data: { updatedAt: new Date() },
      });
      await this.audit.record({
        action: "chat.message_sent",
        userId: input.userId,
        entityType: "chat_room",
        entityId: input.roomId,
        metadata: { messageId: input.messageId, isStaff: input.isStaff },
      });
      if (!input.isStaff) {
        this.telegram.notifyCustomerMessage({
          shop: resolveStorefrontId(input.storefront),
          userId: input.userId,
          channel: "Live chat",
          text: input.body || "Sent a photo.",
          path: `/admin/chat?room=${input.roomId}`,
        });
      }
      const notifyUserId = input.isStaff
        ? input.customerUserId
        : await this.findStaffNotifyTarget(input.roomId, input.customerUserId);
      if (!notifyUserId || notifyUserId === input.userId) return;
      await this.notifications.notify({
        userId: notifyUserId,
        kind: "chat.message",
        title: "New support chat message",
        body: input.imageUrl && !input.body
          ? input.isStaff
            ? "Support sent you a photo."
            : "Customer sent a photo."
          : input.isStaff
            ? "Support sent you a chat message."
            : "Customer sent a chat message.",
        href: input.isStaff ? `/admin/chat/${input.roomId}` : `/chat/${input.roomId}`,
        idempotencyKey: `chat-msg:${input.idempotencyKey}`,
        actorUserId: input.userId,
      });
    } catch {
      // The message is already saved and delivered if a later side effect fails.
    }
  }

  private async findStaffNotifyTarget(
    roomId: string,
    customerUserId: string,
  ): Promise<string | null> {
    const staff = await this.prisma.chatRoomParticipant.findFirst({
      where: {
        roomId,
        role: ChatParticipantRole.STAFF,
        userId: { not: customerUserId },
      },
      orderBy: { lastSeenAt: "desc" },
    });
    return staff?.userId ?? null;
  }

  private mapMessage(
    message: {
      id: string;
      roomId: string;
      senderUserId: string;
      body: string;
      imageUrl?: string | null;
      createdAt: Date;
      sender: { id: string; displayName: string | null; roles: unknown };
    },
  ): PublicChatMessage {
    const roles = message.sender.roles as RoleName[];
    return {
      id: message.id,
      roomId: message.roomId,
      senderUserId: message.senderUserId,
      senderDisplayName: message.sender.displayName,
      senderIsStaff: roles.some((role) => isStaffRole(role)),
      body: message.body,
      imageUrl: message.imageUrl ?? null,
      createdAt: message.createdAt.toISOString(),
    };
  }

  private mapRoomSummary(row: {
    id: string;
    ticketId: string | null;
    customerUserId: string;
    status: ChatRoomStatus;
    updatedAt: Date;
    createdAt: Date;
    ticket?: { ticketNumber: string } | null;
    messages?: Array<{
      id: string;
      roomId: string;
      senderUserId: string;
      body: string;
      imageUrl?: string | null;
      createdAt: Date;
      sender: { id: string; displayName: string | null; roles: unknown };
    }>;
  }): PublicChatRoomSummary {
    const last = row.messages?.[0];
    return {
      id: row.id,
      ticketId: row.ticketId,
      ticketNumber: row.ticket?.ticketNumber ?? null,
      status: row.status,
      customerUserId: row.customerUserId,
      updatedAt: row.updatedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      lastMessage: last ? this.mapMessage(last) : null,
    };
  }
}

/** Re-export for gateway guards — keep Forbidden for explicit ACL denials. */
export { ForbiddenException };
