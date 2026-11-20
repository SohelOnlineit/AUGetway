import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AdminContactDetail,
  AdminContactListItem,
  AdminPage,
  ContactInquiryCreateResult,
} from "@amarpin/types";
import {
  ContactInquiryStatus,
  ContactMessageDirection,
  ContactReplyDeliveryStatus,
  type Prisma,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../shared/audit/audit.service";
import { resolveStorefrontId, type StorefrontId } from "../catalog/storefronts";
import { MailService } from "../../shared/mail/mail.service";
import type {
  AdminContactListQuery,
  AdminContactReplyDto,
  AdminContactUpdateDto,
  CreateContactInquiryDto,
} from "./dto/contact.dto";

@Injectable()
export class ContactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async createPublic(
    dto: CreateContactInquiryDto,
    storefront?: string,
  ): Promise<ContactInquiryCreateResult> {
    const name = dto.name.trim();
    const email = dto.email.trim().toLowerCase();
    const subject = dto.subject.trim();
    const message = dto.message.trim();
    if (name.length < 2 || subject.length < 3 || message.length < 10) {
      throw new BadRequestException("Invalid contact payload");
    }

    const row = await this.prisma.contactInquiry.create({
      data: {
        name,
        email,
        subject,
        storefront: resolveStorefrontId(storefront),
        status: ContactInquiryStatus.NEW,
        messages: {
          create: {
            direction: ContactMessageDirection.INBOUND,
            body: message,
            deliveryStatus: ContactReplyDeliveryStatus.NOT_APPLICABLE,
          },
        },
      },
    });

    await this.audit.record({
      action: "public.contact.created",
      entityType: "contact_inquiry",
      entityId: row.id,
      metadata: { subjectLength: subject.length },
    });

    return {
      id: row.id,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async adminList(
    query: AdminContactListQuery,
  ): Promise<AdminPage<AdminContactListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ContactInquiryWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { email: { contains: q, mode: "insensitive" } },
        { subject: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.contactInquiry.count({ where }),
      this.prisma.contactInquiry.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: rows.map((row) => this.mapList(row)),
      total,
      page,
      pageSize,
    };
  }

  async adminGet(id: string): Promise<AdminContactDetail> {
    const row = await this.prisma.contactInquiry.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!row) throw new NotFoundException("Inquiry not found");
    if (row.status === ContactInquiryStatus.NEW) {
      await this.prisma.contactInquiry.update({
        where: { id },
        data: {
          status: ContactInquiryStatus.READ,
          readAt: row.readAt ?? new Date(),
        },
      });
      row.status = ContactInquiryStatus.READ;
      row.readAt = row.readAt ?? new Date();
    }
    return this.mapDetail(row);
  }

  async adminUpdate(
    actorUserId: string,
    id: string,
    dto: AdminContactUpdateDto,
  ): Promise<AdminContactDetail> {
    const existing = await this.prisma.contactInquiry.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Inquiry not found");
    const status = dto.status ?? existing.status;
    const row = await this.prisma.contactInquiry.update({
      where: { id },
      data: {
        status,
        closedAt:
          status === ContactInquiryStatus.CLOSED
            ? (existing.closedAt ?? new Date())
            : existing.closedAt,
        readAt:
          status !== ContactInquiryStatus.NEW
            ? (existing.readAt ?? new Date())
            : existing.readAt,
      },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    await this.audit.record({
      action: "admin.contact.status_updated",
      userId: actorUserId,
      entityType: "contact_inquiry",
      entityId: id,
      metadata: { status },
    });
    return this.mapDetail(row);
  }

  async adminReply(
    actorUserId: string,
    id: string,
    dto: AdminContactReplyDto,
    storefront?: string,
  ): Promise<AdminContactDetail> {
    const body = dto.body.trim();
    if (body.length < 2) throw new BadRequestException("Reply body required");

    const existing = await this.prisma.contactInquiry.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Inquiry not found");

    const shop: StorefrontId = existing.storefront === "uniqbd" ? "uniqbd" : "amarpin";
    const readiness = await this.mail.readiness(shop);
    let deliveryStatus: ContactReplyDeliveryStatus =
      ContactReplyDeliveryStatus.SKIPPED_NO_PROVIDER;
    let deliveryDetail: string | null =
      readiness.message ??
      "Email provider is not configured; reply stored inbox-only.";

    if (readiness.ready) {
      const result = await this.mail.sendStaffReply({
        kind: "contact_reply",
        to: existing.email,
        subject: `Re: ${existing.subject}`,
        text: body,
        actorUserId,
        storefront: shop,
      });
      if (result.delivered) {
        deliveryStatus = ContactReplyDeliveryStatus.ACCEPTED;
        deliveryDetail = `Accepted by provider ${result.provider}`;
      } else {
        deliveryStatus = ContactReplyDeliveryStatus.FAILED;
        deliveryDetail = `Provider ${result.provider} did not accept delivery`;
      }
    }

    await this.prisma.contactInquiryMessage.create({
      data: {
        inquiryId: id,
        direction: ContactMessageDirection.OUTBOUND,
        body,
        actorUserId,
        deliveryStatus,
        deliveryDetail,
      },
    });

    const row = await this.prisma.contactInquiry.update({
      where: { id },
      data: {
        status: ContactInquiryStatus.REPLIED,
        readAt: existing.readAt ?? new Date(),
      },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    await this.audit.record({
      action: "admin.contact.replied",
      userId: actorUserId,
      entityType: "contact_inquiry",
      entityId: id,
      metadata: { deliveryStatus },
    });

    return this.mapDetail(row);
  }

  private mapList(row: {
    id: string;
    name: string;
    email: string;
    subject: string;
    status: ContactInquiryStatus;
    createdAt: Date;
    updatedAt: Date;
  }): AdminContactListItem {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      subject: row.subject,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapDetail(row: {
    id: string;
    name: string;
    email: string;
    subject: string;
    status: ContactInquiryStatus;
    createdAt: Date;
    updatedAt: Date;
    messages: Array<{
      id: string;
      direction: ContactMessageDirection;
      body: string;
      deliveryStatus: ContactReplyDeliveryStatus;
      deliveryDetail: string | null;
      createdAt: Date;
    }>;
  }): AdminContactDetail {
    return {
      ...this.mapList(row),
      messages: row.messages.map((msg) => ({
        id: msg.id,
        direction: msg.direction,
        body: msg.body,
        deliveryStatus: msg.deliveryStatus,
        deliveryDetail: msg.deliveryDetail,
        createdAt: msg.createdAt.toISOString(),
      })),
    };
  }
}
