import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  AdminPage,
  AdminPaymentDetail,
  AdminPaymentListItem,
} from "@amarpin/types";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { computeRefundSummary, mapRefundListItem } from "../orders/orders.mapper";
import type { AdminPaymentListQuery } from "./dto/admin-payment-list.query";

@Injectable()
export class AdminPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: AdminPaymentListQuery,
  ): Promise<AdminPage<AdminPaymentListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.PaymentIntentWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { id: { equals: q } },
        { externalRef: { contains: q, mode: "insensitive" } },
        { order: { orderNumber: { contains: q, mode: "insensitive" } } },
        { order: { user: { email: { contains: q, mode: "insensitive" } } } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.paymentIntent.count({ where }),
      this.prisma.paymentIntent.findMany({
        where,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              totalMinor: true,
              refundedMinor: true,
              user: { select: { email: true } },
              refunds: { select: { amountMinor: true, status: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: rows.map((row) => {
        const summary = computeRefundSummary(row.order, row.order.refunds);
        return {
          id: row.id,
          orderId: row.orderId,
          orderNumber: row.order.orderNumber,
          customerEmail: row.order.user.email,
          provider: row.provider,
          status: row.status,
          amountMinor: row.amountMinor,
          currency: row.currency,
          externalRef: row.externalRef,
          paymentMethod: row.paymentMethod,
          transactionId: row.transactionId,
          refundedMinor: summary.refundedMinor,
          pendingRefundMinor: summary.pendingMinor,
          succeededAt: row.succeededAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        };
      }),
    };
  }

  async get(id: string): Promise<AdminPaymentDetail> {
    const row = await this.prisma.paymentIntent.findUnique({
      where: { id },
      include: {
        events: { orderBy: { createdAt: "asc" } },
        refunds: { orderBy: { createdAt: "desc" } },
        order: {
          select: {
            id: true,
            orderNumber: true,
            totalMinor: true,
            refundedMinor: true,
            user: { select: { email: true } },
            refunds: { select: { amountMinor: true, status: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException("Payment not found");
    const summary = computeRefundSummary(row.order, row.order.refunds);
    return {
      id: row.id,
      orderId: row.orderId,
      orderNumber: row.order.orderNumber,
      customerEmail: row.order.user.email,
      provider: row.provider,
      status: row.status,
      amountMinor: row.amountMinor,
      currency: row.currency,
      externalRef: row.externalRef,
      paymentMethod: row.paymentMethod,
      transactionId: row.transactionId,
      refundedMinor: summary.refundedMinor,
      pendingRefundMinor: summary.pendingMinor,
      succeededAt: row.succeededAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      events: row.events.map((event) => ({
        id: event.id,
        kind: event.kind,
        providerEventId: event.providerEventId,
        createdAt: event.createdAt.toISOString(),
      })),
      refunds: row.refunds.map((refund) =>
        mapRefundListItem(refund, row.order.orderNumber),
      ),
    };
  }
}
