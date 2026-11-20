import { Injectable } from "@nestjs/common";
import type { AdminDashboardDelivery, AdminDashboardSummary } from "@amarpin/types";
import {
  InventoryStatus,
  OrderStatus,
  ProductStatus,
  TicketStatus,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CryptoService } from "../../shared/crypto/crypto.service";
import { AnalyticsService } from "../analytics/analytics.service";
import { deliveryCardFace } from "../catalog/catalog.mapper";

@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly crypto: CryptoService,
  ) {}

  async summary(): Promise<AdminDashboardSummary> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [
      productsTotal,
      productsActive,
      ordersPendingPayment,
      ordersPaid,
      ordersFulfilled,
      customersTotal,
      inventoryAvailable,
      inventoryReserved,
      recentAuditCount,
      openTickets,
      analyticsLast7d,
    ] = await Promise.all([
      this.prisma.product.count(),
      this.prisma.product.count({ where: { status: ProductStatus.ACTIVE } }),
      this.prisma.order.count({
        where: { status: OrderStatus.PENDING_PAYMENT },
      }),
      this.prisma.order.count({ where: { status: OrderStatus.PAID } }),
      this.prisma.order.count({ where: { status: OrderStatus.FULFILLED } }),
      this.prisma.user.count(),
      this.prisma.inventoryItem.count({
        where: { status: InventoryStatus.AVAILABLE },
      }),
      this.prisma.inventoryItem.count({
        where: { status: InventoryStatus.RESERVED },
      }),
      this.prisma.auditEvent.count({ where: { createdAt: { gte: since } } }),
      this.prisma.ticket.count({
        where: {
          status: {
            in: [
              TicketStatus.OPEN,
              TicketStatus.IN_PROGRESS,
              TicketStatus.WAITING_CUSTOMER,
            ],
          },
        },
      }),
      this.analytics.summary(7),
    ]);

    return {
      productsTotal,
      productsActive,
      ordersPendingPayment,
      ordersPaid,
      ordersFulfilled,
      customersTotal,
      inventoryAvailable,
      inventoryReserved,
      recentAuditCount,
      openTickets,
      analyticsLast7d,
    };
  }

  async recentDeliveries(): Promise<{ items: AdminDashboardDelivery[] }> {
    const rows = await this.prisma.orderDelivery.findMany({
      where: { order: { status: OrderStatus.FULFILLED, trashedAt: null } },
      orderBy: { deliveredAt: "desc" },
      take: 12,
      select: {
        deliveredAt: true,
        titleSnapshot: true,
        codeCiphertext: true,
        order: { select: { id: true, orderNumber: true } },
        inventoryItem: {
          select: {
            packageValueId: true,
            product: { select: { variationMeta: true } },
          },
        },
      },
    });
    const items: AdminDashboardDelivery[] = [];
    for (const row of rows) {
      let code = "";
      try {
        code = this.crypto.decryptSecret(row.codeCiphertext);
      } catch {
        continue;
      }
      const face = deliveryCardFace(
        row.inventoryItem.product.variationMeta,
        row.inventoryItem.packageValueId,
        row.titleSnapshot,
      );
      items.push({
        orderId: row.order.id,
        orderNumber: row.order.orderNumber,
        title: face.name,
        region: face.region,
        code,
        deliveredAt: row.deliveredAt.toISOString(),
      });
    }
    return { items };
  }
}
