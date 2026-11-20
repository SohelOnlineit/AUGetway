import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AdminPage,
  AdminProductRequestDetail,
  AdminProductRequestListItem,
  ProductRequestCreateResult,
} from "@amarpin/types";
import {
  ContactReplyDeliveryStatus,
  ProductRequestStatus,
  type Prisma,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../shared/audit/audit.service";
import { resolveStorefrontId, type StorefrontId } from "../catalog/storefronts";
import { MailService } from "../../shared/mail/mail.service";
import type {
  AdminProductRequestListQuery,
  AdminProductRequestUpdateDto,
  CreateProductRequestDto,
} from "./dto/product-request.dto";

@Injectable()
export class ProductRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async createPublic(
    dto: CreateProductRequestDto,
    storefront?: string,
  ): Promise<ProductRequestCreateResult> {
    const productName = dto.productName.trim();
    const customerName = dto.customerName.trim();
    const email = dto.email.trim().toLowerCase();
    const mobile = dto.mobile.trim();
    const details = dto.details.trim();
    if (
      productName.length < 2 ||
      customerName.length < 2 ||
      mobile.length < 8 ||
      details.length < 10
    ) {
      throw new BadRequestException("Invalid product request payload");
    }

    const row = await this.prisma.productRequest.create({
      data: {
        productName,
        customerName,
        email,
        mobile,
        details,
        storefront: resolveStorefrontId(storefront),
        status: ProductRequestStatus.NEW,
      },
    });

    await this.audit.record({
      action: "public.product_request.created",
      entityType: "product_request",
      entityId: row.id,
    });

    return {
      id: row.id,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async adminList(
    query: AdminProductRequestListQuery,
  ): Promise<AdminPage<AdminProductRequestListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ProductRequestWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { productName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { customerName: { contains: q, mode: "insensitive" } },
      ];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.productRequest.count({ where }),
      this.prisma.productRequest.findMany({
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

  async adminGet(id: string): Promise<AdminProductRequestDetail> {
    const row = await this.prisma.productRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Product request not found");
    return this.mapDetail(row);
  }

  async adminUpdate(
    actorUserId: string,
    id: string,
    dto: AdminProductRequestUpdateDto,
    storefront?: string,
  ): Promise<AdminProductRequestDetail> {
    const existing = await this.prisma.productRequest.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Product request not found");

    const status = (dto.status as ProductRequestStatus | undefined) ?? existing.status;
    const adminReply =
      dto.adminReply === undefined
        ? existing.adminReply
        : dto.adminReply?.trim() || null;

    let replyDeliveryStatus = existing.replyDeliveryStatus;
    let replyDeliveryDetail = existing.replyDeliveryDetail;
    let repliedAt = existing.repliedAt;

    if (dto.sendEmail) {
      if (!adminReply) {
        throw new BadRequestException("adminReply is required to send email");
      }
      const shop: StorefrontId = existing.storefront === "uniqbd" ? "uniqbd" : "amarpin";
      const readiness = await this.mail.readiness(shop);
      if (!readiness.ready) {
        replyDeliveryStatus = ContactReplyDeliveryStatus.SKIPPED_NO_PROVIDER;
        replyDeliveryDetail =
          readiness.message ??
          "Email provider is not configured; reply stored only.";
      } else {
        const result = await this.mail.sendStaffReply({
          kind: "product_request_reply",
          to: existing.email,
          subject: `Re: Product request — ${existing.productName}`,
          text: adminReply,
          actorUserId,
          storefront: shop,
        });
        if (result.delivered) {
          replyDeliveryStatus = ContactReplyDeliveryStatus.ACCEPTED;
          replyDeliveryDetail = `Accepted by provider ${result.provider}`;
        } else {
          replyDeliveryStatus = ContactReplyDeliveryStatus.FAILED;
          replyDeliveryDetail = `Provider ${result.provider} did not accept delivery`;
        }
      }
      repliedAt = new Date();
    }

    const nextStatus =
      dto.sendEmail && adminReply
        ? ProductRequestStatus.REPLIED
        : status;

    const row = await this.prisma.productRequest.update({
      where: { id },
      data: {
        status: nextStatus,
        adminReply,
        replyDeliveryStatus,
        replyDeliveryDetail,
        repliedAt,
        reviewedByUserId: actorUserId,
      },
    });

    await this.audit.record({
      action: "admin.product_request.updated",
      userId: actorUserId,
      entityType: "product_request",
      entityId: id,
      metadata: {
        status: row.status,
        deliveryStatus: row.replyDeliveryStatus,
        emailAttempted: Boolean(dto.sendEmail),
      },
    });

    return this.mapDetail(row);
  }

  private mapList(row: {
    id: string;
    productName: string;
    customerName: string;
    email: string;
    mobile: string;
    status: ProductRequestStatus;
    createdAt: Date;
    updatedAt: Date;
  }): AdminProductRequestListItem {
    return {
      id: row.id,
      productName: row.productName,
      customerName: row.customerName,
      email: row.email,
      mobile: row.mobile,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapDetail(row: {
    id: string;
    productName: string;
    customerName: string;
    email: string;
    mobile: string;
    details: string;
    status: ProductRequestStatus;
    adminReply: string | null;
    replyDeliveryStatus: ContactReplyDeliveryStatus;
    replyDeliveryDetail: string | null;
    repliedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): AdminProductRequestDetail {
    return {
      ...this.mapList(row),
      details: row.details,
      adminReply: row.adminReply,
      replyDeliveryStatus: row.replyDeliveryStatus,
      replyDeliveryDetail: row.replyDeliveryDetail,
      repliedAt: row.repliedAt?.toISOString() ?? null,
    };
  }
}
