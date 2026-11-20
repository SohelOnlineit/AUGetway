import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AdminPage,
  AdminTicketDetail,
  AdminTicketListItem,
  PublicTicketDetail,
  PublicTicketListItem,
} from "@amarpin/types";
import {
  ChatParticipantRole,
  ChatRoomStatus,
  TicketPriority,
  TicketStatus,
  type Prisma,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../shared/audit/audit.service";
import { resolveStorefrontId } from "../catalog/storefronts";
import { NotificationsService } from "../notifications/notifications.service";
import { TelegramService } from "../telegram/telegram.service";
import type { AdminTicketListQuery, AdminTicketUpdateDto } from "./dto/admin-ticket.dto";
import type { CreateTicketDto } from "./dto/create-ticket.dto";
import type { TicketReplyDto } from "./dto/ticket-reply.dto";
import {
  mapAdminTicketDetail,
  mapAdminTicketListItem,
  mapPublicTicketDetail,
  mapPublicTicketListItem,
} from "./tickets.mapper";

const DETAIL_INCLUDE = {
  chatRoom: { select: { id: true } },
  _count: { select: { messages: true } },
  messages: {
    orderBy: { createdAt: "asc" as const },
    include: {
      author: { select: { id: true, displayName: true, roles: true } },
    },
  },
} satisfies Prisma.TicketInclude;

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly telegram: TelegramService,
  ) {}

  async listForUser(userId: string): Promise<PublicTicketListItem[]> {
    const rows = await this.prisma.ticket.findMany({
      where: { userId },
      include: {
        chatRoom: { select: { id: true } },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    return rows.map(mapPublicTicketListItem);
  }

  async getForUser(userId: string, ticketId: string): Promise<PublicTicketDetail> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: DETAIL_INCLUDE,
    });
    if (!ticket || ticket.userId !== userId) {
      throw new NotFoundException("Ticket not found");
    }
    return mapPublicTicketDetail(ticket);
  }

  async createForUser(
    userId: string,
    dto: CreateTicketDto,
    storefront?: string,
  ): Promise<PublicTicketDetail> {
    const subject = dto.subject.trim();
    const body = dto.body.trim();
    const idempotencyKey = dto.idempotencyKey.trim();
    if (subject.length < 4 || body.length < 8) {
      throw new BadRequestException("Subject and body are required");
    }

    const existing = await this.prisma.ticket.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      include: DETAIL_INCLUDE,
    });
    if (existing) return mapPublicTicketDetail(existing);

    let fresh = true;
    const created = await this.prisma.$transaction(
      async (tx) => {
        const ticketNumber = await this.nextTicketNumber(tx);
        try {
          return await tx.ticket.create({
            data: {
              ticketNumber,
              userId,
              subject,
              status: TicketStatus.OPEN,
              priority: TicketPriority.NORMAL,
              idempotencyKey,
              messages: {
                create: {
                  authorUserId: userId,
                  body,
                  idempotencyKey: `${idempotencyKey}:root`,
                },
              },
              chatRoom: {
                create: {
                  customerUserId: userId,
                  status: ChatRoomStatus.OPEN,
                  participants: {
                    create: {
                      userId,
                      role: ChatParticipantRole.CUSTOMER,
                    },
                  },
                },
              },
            },
            include: DETAIL_INCLUDE,
          });
        } catch (error) {
          if (
            error instanceof Error &&
            "code" in error &&
            (error as { code?: string }).code === "P2002"
          ) {
            const raced = await tx.ticket.findUnique({
              where: { userId_idempotencyKey: { userId, idempotencyKey } },
              include: DETAIL_INCLUDE,
            });
            if (raced) {
              fresh = false;
              return raced;
            }
          }
          throw error;
        }
      },
      { isolationLevel: "Serializable", timeout: 15_000 },
    );

    await this.audit.record({
      action: "ticket.created",
      userId,
      entityType: "ticket",
      entityId: created.id,
      metadata: { ticketNumber: created.ticketNumber },
    });

    if (fresh) {
      const shop = resolveStorefrontId(storefront);
      this.telegram.notifyCustomerMessage({
        shop,
        userId,
        channel: "Ticket",
        text: `${created.subject}: ${body}`,
        path: `/admin/tickets/${created.id}`,
      });
    }

    return mapPublicTicketDetail(created);
  }

  async replyForUser(
    userId: string,
    ticketId: string,
    dto: TicketReplyDto,
    storefront?: string,
  ): Promise<PublicTicketDetail> {
    const body = dto.body.trim();
    const idempotencyKey = dto.idempotencyKey.trim();
    if (!body) throw new BadRequestException("Message body is required");

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket || ticket.userId !== userId) {
      throw new NotFoundException("Ticket not found");
    }
    if (ticket.status === TicketStatus.CLOSED) {
      throw new BadRequestException("Ticket is closed; reopen to reply");
    }

    const existingMsg = await this.prisma.ticketMessage.findUnique({
      where: { ticketId_idempotencyKey: { ticketId, idempotencyKey } },
    });
    if (existingMsg) return this.getForUser(userId, ticketId);

    await this.prisma.$transaction(async (tx) => {
      await tx.ticketMessage.create({
        data: {
          ticketId,
          authorUserId: userId,
          body,
          idempotencyKey,
        },
      });
      await tx.ticket.update({
        where: { id: ticketId },
        data: {
          status:
            ticket.status === TicketStatus.WAITING_CUSTOMER
              ? TicketStatus.IN_PROGRESS
              : ticket.status === TicketStatus.RESOLVED
                ? TicketStatus.OPEN
                : ticket.status,
          updatedAt: new Date(),
        },
      });
    });

    await this.audit.record({
      action: "ticket.customer_reply",
      userId,
      entityType: "ticket",
      entityId: ticketId,
    });

    this.telegram.notifyCustomerMessage({
      shop: resolveStorefrontId(storefront),
      userId,
      channel: "Ticket",
      text: `${ticket.ticketNumber}: ${body}`,
      path: `/admin/tickets/${ticketId}`,
    });

    if (ticket.assignedToUserId) {
      await this.notifications.notify({
        userId: ticket.assignedToUserId,
        kind: "ticket.customer_reply",
        title: `Ticket ${ticket.ticketNumber} updated`,
        body: "Customer replied to a support ticket.",
        href: `/admin/tickets/${ticketId}`,
        idempotencyKey: `ticket-reply:${idempotencyKey}`,
        actorUserId: userId,
      });
    }

    return this.getForUser(userId, ticketId);
  }

  async statusActionForUser(
    userId: string,
    ticketId: string,
    action: "close" | "reopen",
    reason?: string,
  ): Promise<PublicTicketDetail> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket || ticket.userId !== userId) {
      throw new NotFoundException("Ticket not found");
    }

    if (action === "close") {
      if (ticket.status === TicketStatus.CLOSED) {
        return this.getForUser(userId, ticketId);
      }
      await this.prisma.ticket.update({
        where: { id: ticketId },
        data: {
          status: TicketStatus.CLOSED,
          closedAt: new Date(),
        },
      });
      await this.prisma.chatRoom.updateMany({
        where: { ticketId },
        data: { status: ChatRoomStatus.CLOSED },
      });
      await this.audit.record({
        action: "ticket.customer_close",
        userId,
        entityType: "ticket",
        entityId: ticketId,
        metadata: { reason: reason?.slice(0, 200) ?? null },
      });
    } else {
      if (ticket.status !== TicketStatus.CLOSED && ticket.status !== TicketStatus.RESOLVED) {
        return this.getForUser(userId, ticketId);
      }
      await this.prisma.ticket.update({
        where: { id: ticketId },
        data: {
          status: TicketStatus.OPEN,
          closedAt: null,
        },
      });
      await this.prisma.chatRoom.updateMany({
        where: { ticketId },
        data: { status: ChatRoomStatus.OPEN },
      });
      await this.audit.record({
        action: "ticket.customer_reopen",
        userId,
        entityType: "ticket",
        entityId: ticketId,
        metadata: { reason: reason?.slice(0, 200) ?? null },
      });
    }

    return this.getForUser(userId, ticketId);
  }

  async adminList(
    query: AdminTicketListQuery,
  ): Promise<AdminPage<AdminTicketListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.TicketWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.assignedToUserId) where.assignedToUserId = query.assignedToUserId;
    if (query.customerId) where.userId = query.customerId;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { id: { equals: q } },
        { ticketNumber: { contains: q, mode: "insensitive" } },
        { subject: { contains: q, mode: "insensitive" } },
        { user: { email: { contains: q, mode: "insensitive" } } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.ticket.count({ where }),
      this.prisma.ticket.findMany({
        where,
        include: {
          chatRoom: { select: { id: true } },
          _count: { select: { messages: true } },
          user: { select: { id: true, email: true, displayName: true, roles: true } },
          assignee: { select: { id: true, email: true, displayName: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: rows.map(mapAdminTicketListItem),
    };
  }

  async adminGet(ticketId: string): Promise<AdminTicketDetail> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        ...DETAIL_INCLUDE,
        user: { select: { id: true, email: true, displayName: true, roles: true } },
        assignee: { select: { id: true, email: true, displayName: true } },
      },
    });
    if (!ticket) throw new NotFoundException("Ticket not found");
    return mapAdminTicketDetail(ticket);
  }

  async adminUpdate(
    actorUserId: string,
    ticketId: string,
    dto: AdminTicketUpdateDto,
  ): Promise<AdminTicketDetail> {
    const reason = dto.reason.trim();
    if (reason.length < 8) {
      throw new BadRequestException("Reason is required (min 8 chars)");
    }

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException("Ticket not found");

    if (dto.assignedToUserId) {
      const assignee = await this.prisma.user.findUnique({
        where: { id: dto.assignedToUserId },
      });
      if (!assignee) throw new BadRequestException("Assignee not found");
    }

    const data: Prisma.TicketUpdateInput = {};
    if (dto.status !== undefined) {
      data.status = dto.status;
      data.closedAt =
        dto.status === TicketStatus.CLOSED || dto.status === TicketStatus.RESOLVED
          ? new Date()
          : null;
    }
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.assignedToUserId !== undefined) {
      data.assignee = dto.assignedToUserId
        ? { connect: { id: dto.assignedToUserId } }
        : { disconnect: true };
    }

    await this.prisma.ticket.update({
      where: { id: ticketId },
      data,
    });

    if (
      dto.status === TicketStatus.CLOSED ||
      dto.status === TicketStatus.RESOLVED
    ) {
      await this.prisma.chatRoom.updateMany({
        where: { ticketId },
        data: { status: ChatRoomStatus.CLOSED },
      });
    } else if (dto.status === TicketStatus.OPEN || dto.status === TicketStatus.IN_PROGRESS) {
      await this.prisma.chatRoom.updateMany({
        where: { ticketId },
        data: { status: ChatRoomStatus.OPEN },
      });
    }

    await this.audit.record({
      action: "admin.ticket.update",
      userId: actorUserId,
      entityType: "ticket",
      entityId: ticketId,
      metadata: {
        reason,
        status: dto.status ?? null,
        priority: dto.priority ?? null,
        assignedToUserId: dto.assignedToUserId ?? null,
      },
    });

    if (dto.status || dto.assignedToUserId !== undefined) {
      await this.notifications.notify({
        userId: ticket.userId,
        kind: "ticket.admin_update",
        title: `Ticket ${ticket.ticketNumber} updated`,
        body: "Support updated your ticket.",
        href: `/tickets/${ticketId}`,
        idempotencyKey: `admin-ticket-update:${ticketId}:${Date.now()}`,
        actorUserId,
      });
    }

    return this.adminGet(ticketId);
  }

  async adminReply(
    actorUserId: string,
    ticketId: string,
    dto: TicketReplyDto,
  ): Promise<AdminTicketDetail> {
    const body = dto.body.trim();
    const idempotencyKey = dto.idempotencyKey.trim();
    if (!body) throw new BadRequestException("Message body is required");

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException("Ticket not found");
    if (ticket.status === TicketStatus.CLOSED) {
      throw new BadRequestException("Ticket is closed");
    }

    const existingMsg = await this.prisma.ticketMessage.findUnique({
      where: { ticketId_idempotencyKey: { ticketId, idempotencyKey } },
    });
    if (existingMsg) return this.adminGet(ticketId);

    await this.prisma.$transaction(async (tx) => {
      await tx.ticketMessage.create({
        data: {
          ticketId,
          authorUserId: actorUserId,
          body,
          idempotencyKey,
        },
      });
      await tx.ticket.update({
        where: { id: ticketId },
        data: {
          status: TicketStatus.WAITING_CUSTOMER,
          assignedToUserId: ticket.assignedToUserId ?? actorUserId,
          updatedAt: new Date(),
        },
      });
      // Ensure staff is a chat participant when linked room exists.
      const room = await tx.chatRoom.findUnique({ where: { ticketId } });
      if (room) {
        await tx.chatRoomParticipant.upsert({
          where: {
            roomId_userId: { roomId: room.id, userId: actorUserId },
          },
          create: {
            roomId: room.id,
            userId: actorUserId,
            role: ChatParticipantRole.STAFF,
          },
          update: { lastSeenAt: new Date() },
        });
      }
    });

    await this.audit.record({
      action: "admin.ticket.reply",
      userId: actorUserId,
      entityType: "ticket",
      entityId: ticketId,
    });

    await this.notifications.notify({
      userId: ticket.userId,
      kind: "ticket.staff_reply",
      title: `Reply on ticket ${ticket.ticketNumber}`,
      body: "Support replied to your ticket.",
      href: `/tickets/${ticketId}`,
      idempotencyKey: `ticket-staff-reply:${idempotencyKey}`,
      actorUserId,
    });

    return this.adminGet(ticketId);
  }

  private async nextTicketNumber(tx: Prisma.TransactionClient): Promise<string> {
    await tx.ticketNumberSequence.upsert({
      where: { id: "default" },
      create: { id: "default", nextValue: 1001 },
      update: {},
    });
    const updated = await tx.$queryRaw<Array<{ nextValue: number }>>`
      UPDATE ticket_number_sequences
      SET "nextValue" = "nextValue" + 1
      WHERE id = 'default'
      RETURNING "nextValue" - 1 AS "nextValue"
    `;
    const value = updated[0]?.nextValue ?? 1000;
    return `TKT-${value}`;
  }
}
