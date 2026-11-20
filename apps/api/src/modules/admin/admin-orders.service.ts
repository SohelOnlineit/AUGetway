import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AdminOrderDetail,
  AdminOrderListItem,
  AdminOrderListPage,
} from "@amarpin/types";
import { normalizeOriginSource, orderOriginChoices } from "@amarpin/types";
import {
  FulfillmentStatus,
  InventoryStatus,
  OrderStatus,
  PaymentIntentStatus,
  type Prisma,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../shared/audit/audit.service";
import { CryptoService } from "../../shared/crypto/crypto.service";
import { MailService } from "../../shared/mail/mail.service";
import { readPublicPackages, readStoredCustomerAnswers } from "../catalog/catalog.mapper";
import { FulfillmentService } from "../orders/fulfillment.service";
import { PaymentsService } from "../payments/payments.service";
import { PointsService } from "../points/points.service";
import { CouponsService } from "../promotions/coupons.service";
import { maskSecret } from "./admin.util";
import { paymentMethodLabel } from "../payments/uddoktapay.client";
import type {
  AdminOrderActionDto,
  AdminOrderCustomerInputDto,
  AdminOrderCustomerNoteDto,
  AdminOrderListQuery,
  SelectedInventoryItemDto,
} from "./dto/orders.dto";

@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly fulfillment: FulfillmentService,
    private readonly coupons: CouponsService,
    private readonly points: PointsService,
    private readonly mail: MailService,
    private readonly crypto: CryptoService,
    private readonly payments: PaymentsService,
  ) {}

  async list(
    query: AdminOrderListQuery,
  ): Promise<AdminOrderListPage> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.OrderWhereInput = {
      trashedAt: query.view === "trash" ? { not: null } : null,
    };
    if (query.view !== "trash" && query.status) where.status = query.status;
    if (query.customerId) where.userId = query.customerId;
    if (query.origin) where.originSource = normalizeOriginSource(query.origin);
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { orderNumber: { contains: q, mode: "insensitive" } },
        { id: { equals: q } },
        { user: { email: { contains: q, mode: "insensitive" } } },
        { contactEmail: { contains: q, mode: "insensitive" } },
        { contactName: { contains: q, mode: "insensitive" } },
        { contactPhone: { contains: q, mode: "insensitive" } },
      ];
    }

    const visible: Prisma.OrderWhereInput = { trashedAt: null };
    const [total, rows, groups, originGroups, trash] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, displayName: true, isGuest: true } },
          items: {
            select: {
              quantity: true,
              titleSnapshot: true,
              unitPriceMinor: true,
              product: {
                select: {
                  variationMeta: true,
                  images: { orderBy: [{ storefront: "asc" }, { sortOrder: "asc" }], take: 1, select: { url: true } },
                },
              },
            },
          },
          paymentIntents: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { paymentMethod: true, transactionId: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.groupBy({
        by: ["status"],
        where: visible,
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ["originSource"],
        where: visible,
        _count: { _all: true },
      }),
      this.prisma.order.count({ where: { trashedAt: { not: null } } }),
    ]);
    const count = (status: OrderStatus) =>
      groups.find((group) => group.status === status)?._count._all ?? 0;

    return {
      page,
      pageSize,
      total,
      items: await Promise.all(rows.map(async (row) => {
        const item = this.mapListItem(row);
        const paid = row.status === OrderStatus.PAID
          || row.status === OrderStatus.FULFILLED
          || row.status === OrderStatus.PARTIALLY_REFUNDED;
        if (item.transactionId || row.originChannel === "WALLET" || !paid) return item;
        const fresh = await this.payments.gatewayPaymentForOrder(row.id);
        return {
          ...item,
          paymentMethod: fresh.method ?? item.paymentMethod,
          transactionId: fresh.transactionId,
        };
      })),
      origins: orderOriginChoices(originGroups.map((group) => group.originSource)),
      stats: {
        all: groups.reduce((sum, group) => sum + group._count._all, 0),
        pending: count(OrderStatus.PENDING_PAYMENT),
        paid: count(OrderStatus.PAID),
        completed: count(OrderStatus.FULFILLED),
        cancelled: count(OrderStatus.CANCELLED),
        refunded: count(OrderStatus.REFUNDED) + count(OrderStatus.PARTIALLY_REFUNDED),
        trash,
      },
      payment: query.q?.trim() ? await this.paymentByOrderNumber(query.q) : null,
    };
  }

  private async paymentByOrderNumber(raw: string) {
    const trimmed = raw.trim().replace(/^#/, "");
    const plain = trimmed.replace(/^UQ-/i, "");
    const keys = [...new Set([trimmed, plain].filter((value) => value.length > 0))];
    if (!keys.length) return null;
    const order = await this.prisma.order.findFirst({
      where: { orderNumber: { in: keys } },
      include: {
        paymentIntents: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            paymentMethod: true,
            transactionId: true,
            status: true,
            externalRef: true,
            amountMinor: true,
          },
        },
      },
    });
    if (!order) return null;
    const intent = order.paymentIntents[0] ?? null;
    const wallet = order.originChannel === "WALLET";
    let method = wallet ? "Wallet" : paymentMethodLabel(intent?.paymentMethod) ?? intent?.paymentMethod ?? null;
    let transactionId = wallet ? null : intent?.transactionId ?? null;
    const paid = order.status === OrderStatus.PAID
      || order.status === OrderStatus.FULFILLED
      || order.status === OrderStatus.PARTIALLY_REFUNDED;
    if (!wallet && paid && (!method || !transactionId)) {
      const fresh = await this.payments.gatewayPaymentForOrder(order.id);
      method = method ?? fresh.method;
      transactionId = transactionId ?? fresh.transactionId;
    }
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalMinor: intent?.amountMinor ?? order.totalMinor,
      currency: order.currency,
      paidAt: order.paidAt?.toISOString() ?? null,
      paymentMethod: method,
      transactionId,
      invoiceId: intent?.externalRef ?? null,
      paymentStatus: intent?.status ?? null,
    };
  }

  async get(id: string): Promise<AdminOrderDetail> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, displayName: true, isGuest: true } },
        items: {
          include: {
            product: {
              select: {
                variationMeta: true,
                images: { orderBy: [{ storefront: "asc" }, { sortOrder: "asc" }], take: 1, select: { url: true } },
              },
            },
          },
        },
        deliveries: {
          select: {
            inventoryItemId: true,
            titleSnapshot: true,
            inventoryItem: {
              select: {
                packageValueId: true,
                product: { select: { priceMinor: true, variationMeta: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!order) throw new NotFoundException("Order not found");

    const gateway = order.originChannel === "WALLET"
      ? { method: "Wallet", transactionId: null }
      : await this.payments.gatewayPaymentForOrder(order.id);
    const base = this.mapListItem(order);
    return {
      ...base,
      subtotalMinor: order.subtotalMinor,
      refundedMinor: order.refundedMinor,
      reservationExpiresAt: order.reservationExpiresAt.toISOString(),
      fulfilledAt: order.fulfilledAt?.toISOString() ?? null,
      items: order.items.map((item) => {
        const face = orderLineFace(item.product.variationMeta, item.unitPriceMinor);
        return {
          id: item.id,
          productId: item.productId,
          titleSnapshot: item.titleSnapshot,
          quantity: item.quantity,
          unitPriceMinor: item.unitPriceMinor,
          lineTotalMinor: item.lineTotalMinor,
          imageUrl: face.imageUrl || item.product.images[0]?.url || null,
          packageName: face.packageName,
          region: face.region,
          deliveryLabel: face.deliveryLabel,
          customerInputs: readStoredCustomerAnswers(item.customerInputs),
        };
      }),
      deliveryCount: order.deliveries.length,
      giftCards: order.deliveries.map((delivery) => {
        const face = packageFace(
          delivery.inventoryItem.product.variationMeta,
          delivery.inventoryItem.packageValueId,
          delivery.titleSnapshot,
        );
        return {
          inventoryItemId: delivery.inventoryItemId,
          title: face.name ?? delivery.titleSnapshot,
          region: face.region,
          faceValue: face.faceValue,
          codeMasked: maskSecret(`xx${delivery.inventoryItemId.slice(-6)}`),
          amountMinor: packagePrice(
            delivery.inventoryItem.product.variationMeta,
            delivery.inventoryItem.product.priceMinor,
            delivery.inventoryItem.packageValueId,
          ),
        };
      }),
      // Admin never receives codes. Pending and paid orders can be completed from here.
      allowedActions:
        order.status === OrderStatus.PENDING_PAYMENT
          ? ["CANCEL_PENDING", "MARK_COMPLETE"]
          : order.status === OrderStatus.PAID
            ? ["MARK_COMPLETE"]
            : [],
      paymentMethod: order.originChannel === "WALLET" ? "Wallet" : gateway.method,
      transactionId: gateway.transactionId,
    };
  }

  async applyAction(
    actorUserId: string,
    orderId: string,
    dto: AdminOrderActionDto,
  ): Promise<AdminOrderDetail> {
    if (dto.action === "MOVE_TO_TRASH" || dto.action === "RESTORE") {
      return this.setTrash(actorUserId, orderId, dto.action === "MOVE_TO_TRASH");
    }
    if (dto.action === "SET_STATUS") {
      if (!dto.status) throw new BadRequestException("Choose a status");
      return this.setStatus(actorUserId, orderId, dto.status, dto.inventoryItems);
    }
    if (dto.action === "MARK_COMPLETE") {
      return this.markComplete(actorUserId, orderId, dto.inventoryItems);
    }
    if (dto.action !== "CANCEL_PENDING") {
      throw new BadRequestException("Unsupported order action");
    }

    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException("Order not found");
      if (order.status !== OrderStatus.PENDING_PAYMENT) {
        throw new BadRequestException(
          "Only pending-payment orders can be cancelled by admin",
        );
      }

      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
      });
      await this.fulfillment.recordStatus(tx, {
        orderId,
        fromStatus: OrderStatus.PENDING_PAYMENT,
        toStatus: OrderStatus.CANCELLED,
        reason: "admin.cancel_pending",
      });
      await this.coupons.releaseHeld(tx, orderId);
      await tx.paymentIntent.updateMany({
        where: {
          orderId,
          status: {
            in: [
              PaymentIntentStatus.REQUIRES_CONFIRMATION,
              PaymentIntentStatus.PROCESSING,
            ],
          },
        },
        data: {
          status: PaymentIntentStatus.CANCELLED,
          failedAt: new Date(),
          failureReason: "Cancelled by admin",
        },
      });
      await tx.inventoryItem.updateMany({
        where: {
          reservedOrderId: orderId,
          status: InventoryStatus.RESERVED,
        },
        data: {
          status: InventoryStatus.AVAILABLE,
          reservedOrderId: null,
          reservedUntil: null,
        },
      });
    });

    await this.audit.record({
      action: "admin.order.cancel_pending",
      userId: actorUserId,
      entityType: "order",
      entityId: orderId,
    });

    return this.get(orderId);
  }

  private async setTrash(
    actorUserId: string,
    orderId: string,
    trash: boolean,
  ): Promise<AdminOrderDetail> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException("Order not found");
    const already = Boolean(order.trashedAt) === trash;
    if (!already) {
      await this.prisma.order.update({
        where: { id: orderId },
        data: { trashedAt: trash ? new Date() : null },
      });
      await this.audit.record({
        action: trash ? "admin.order.trash" : "admin.order.restore",
        userId: actorUserId,
        entityType: "order",
        entityId: orderId,
      });
    }
    return this.get(orderId);
  }

  private async setStatus(
    actorUserId: string,
    orderId: string,
    status: "PENDING_PAYMENT" | "PAID" | "FULFILLED" | "CANCELLED" | "REFUNDED",
    inventoryItems?: SelectedInventoryItemDto[],
  ): Promise<AdminOrderDetail> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException("Order not found");
    if (order.status === status) {
      if (status === "FULFILLED" && (inventoryItems?.length ?? 0) > 0) {
        await this.prisma.$transaction((tx) => this.sellSelectedUnits(tx, orderId, inventoryItems));
      }
      return this.get(orderId);
    }
    if (
      status === "FULFILLED" &&
      (order.status === OrderStatus.PENDING_PAYMENT || order.status === OrderStatus.PAID)
    ) {
      return this.markComplete(actorUserId, orderId, inventoryItems);
    }

    const next = status as OrderStatus;
    const reopen = next === OrderStatus.PAID || next === OrderStatus.PENDING_PAYMENT;
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: next,
          paidAt: next === OrderStatus.PAID ? order.paidAt ?? new Date() : next === OrderStatus.PENDING_PAYMENT ? null : order.paidAt,
          fulfillmentStatus: next === OrderStatus.FULFILLED
            ? FulfillmentStatus.COMPLETED
            : reopen
              ? FulfillmentStatus.NOT_STARTED
              : undefined,
          fulfilledAt: next === OrderStatus.FULFILLED ? order.fulfilledAt ?? new Date() : reopen ? null : undefined,
        },
      });
      if (next === OrderStatus.CANCELLED || next === OrderStatus.REFUNDED) {
        await this.coupons.releaseHeld(tx, orderId);
        await this.closeOpenPayments(tx, orderId);
        await tx.inventoryItem.updateMany({
          where: { reservedOrderId: orderId, status: InventoryStatus.RESERVED },
          data: { status: InventoryStatus.AVAILABLE, reservedOrderId: null, reservedUntil: null },
        });
      }
      await this.fulfillment.recordStatus(tx, {
        orderId,
        fromStatus: order.status,
        toStatus: next,
        reason: "admin.set_status",
      });
      if (next === OrderStatus.FULFILLED) {
        await this.sellSelectedUnits(tx, orderId, inventoryItems);
      }
    });
    if (next === OrderStatus.FULFILLED) this.fulfillment.notifyOrderCompleted(orderId);
    await this.points.syncOrder(orderId);
    await this.audit.record({
      action: "admin.order.set_status",
      userId: actorUserId,
      entityType: "order",
      entityId: orderId,
      metadata: { status: next },
    });
    return this.get(orderId);
  }

  private async markComplete(
    actorUserId: string,
    orderId: string,
    inventoryItems?: SelectedInventoryItemDto[],
  ): Promise<AdminOrderDetail> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException("Order not found");
    if (order.status === OrderStatus.FULFILLED) {
      throw new BadRequestException("This order is already complete");
    }
    if (order.status !== OrderStatus.PAID && order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException("Only a pending or paid order can be marked complete");
    }

    if (order.status === OrderStatus.PENDING_PAYMENT) {
      const reserved = await this.prisma.inventoryItem.count({
        where: { reservedOrderId: orderId, status: InventoryStatus.RESERVED },
      });
      if (reserved === 0) {
        await this.prisma.$transaction(async (tx) => {
          await tx.order.update({
            where: { id: orderId },
            data: {
              status: OrderStatus.FULFILLED,
              fulfillmentStatus: FulfillmentStatus.COMPLETED,
              fulfilledAt: new Date(),
            },
          });
          await this.closeOpenPayments(tx, orderId);
          await this.fulfillment.recordStatus(tx, {
            orderId,
            fromStatus: OrderStatus.PENDING_PAYMENT,
            toStatus: OrderStatus.FULFILLED,
            reason: "admin.complete",
          });
          await this.sellSelectedUnits(tx, orderId, inventoryItems);
        });
      } else {
        await this.prisma.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.PAID },
        });
        try {
          await this.fulfillPaid(orderId);
          await this.prisma.$transaction(async (tx) => {
            await this.closeOpenPayments(tx, orderId);
            await this.sellSelectedUnits(tx, orderId, inventoryItems);
          });
        } catch (error) {
          await this.prisma.order.updateMany({
            where: { id: orderId, status: OrderStatus.PAID },
            data: { status: OrderStatus.PENDING_PAYMENT },
          });
          throw error;
        }
      }
    } else {
      await this.fulfillPaid(orderId);
      await this.prisma.$transaction((tx) => this.sellSelectedUnits(tx, orderId, inventoryItems));
    }

    await this.points.syncOrder(orderId);
    await this.audit.record({
      action: "admin.order.complete",
      userId: actorUserId,
      entityType: "order",
      entityId: orderId,
    });
    this.fulfillment.notifyOrderCompleted(orderId);
    return this.get(orderId);
  }

  /** Removes one delivered card and returns that unit to available stock. */
  async removeCard(actorUserId: string, orderId: string, inventoryItemId: string): Promise<AdminOrderDetail> {
    const delivery = await this.prisma.orderDelivery.findFirst({
      where: { orderId, inventoryItemId },
      select: { id: true },
    });
    if (!delivery) throw new NotFoundException("Delivered card not found");
    await this.prisma.$transaction(async (tx) => {
      await tx.orderDelivery.delete({ where: { id: delivery.id } });
      await tx.inventoryItem.updateMany({
        where: { id: inventoryItemId },
        data: { status: InventoryStatus.AVAILABLE, reservedOrderId: null, reservedUntil: null },
      });
    });
    await this.audit.record({
      action: "admin.order.remove_card",
      userId: actorUserId,
      entityType: "order",
      entityId: orderId,
      metadata: { inventoryItemId },
    });
    return this.get(orderId);
  }

  /** Replaces the stored code. The plaintext is never written to the audit log. */
  async updateCardCode(actorUserId: string, orderId: string, inventoryItemId: string, code: string): Promise<{ ok: true }> {
    const trimmed = code.trim();
    if (!trimmed) throw new BadRequestException("Enter a redeem code");
    const unit = await this.prisma.inventoryItem.findUnique({
      where: { id: inventoryItemId },
      select: { id: true },
    });
    if (!unit) throw new NotFoundException("Inventory unit not found");
    const ciphertext = this.crypto.encryptSecret(trimmed);
    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryItem.update({
        where: { id: inventoryItemId },
        data: { codeCiphertext: ciphertext },
      });
      await tx.orderDelivery.updateMany({
        where: { orderId, inventoryItemId },
        data: { codeCiphertext: ciphertext },
      });
    });
    await this.audit.record({
      action: "admin.order.edit_card",
      userId: actorUserId,
      entityType: "order",
      entityId: orderId,
      metadata: { inventoryItemId },
    });
    return { ok: true };
  }

  /** Marks the added cards sold and keeps a masked copy on the order. Codes stay encrypted. */
  private async sellSelectedUnits(
    tx: Prisma.TransactionClient,
    orderId: string,
    inventoryItems?: SelectedInventoryItemDto[],
  ): Promise<void> {
    const picked = new Map<string, string | undefined>();
    for (const item of inventoryItems ?? []) {
      const id = item.id.trim();
      if (!id || picked.has(id)) continue;
      picked.set(id, item.packageValueId?.trim() || undefined);
      if (picked.size >= 20) break;
    }
    if (picked.size === 0) return;

    const [ordered, delivered] = await Promise.all([
      tx.orderItem.aggregate({ where: { orderId }, _sum: { quantity: true } }),
      tx.orderDelivery.count({ where: { orderId } }),
    ]);
    let room = Math.max(0, (ordered._sum.quantity ?? 0) - delivered);
    if (room === 0) return;

    const orderItem = await tx.orderItem.findFirst({
      where: { orderId },
      orderBy: { id: "asc" },
      select: { id: true },
    });
    if (!orderItem) return;

    const units = await tx.inventoryItem.findMany({
      where: { id: { in: [...picked.keys()] }, status: InventoryStatus.AVAILABLE },
      include: { product: { select: { title: true, variationMeta: true } } },
    });

    let soldCount = 0;
    for (const unit of units) {
      if (room <= 0) break;
      const requestedPackage = picked.get(unit.id);
      const packageValueId = unit.packageValueId
        ?? (requestedPackage && packageName(unit.product.variationMeta, requestedPackage) ? requestedPackage : null);
      const sold = await tx.inventoryItem.updateMany({
        where: { id: unit.id, status: InventoryStatus.AVAILABLE },
        data: {
          status: InventoryStatus.SOLD,
          packageValueId,
          reservedOrderId: orderId,
          reservedUntil: null,
        },
      });
      if (sold.count !== 1) continue;
      await tx.orderDelivery.create({
        data: {
          orderId,
          orderItemId: orderItem.id,
          inventoryItemId: unit.id,
          productId: unit.productId,
          titleSnapshot: packageName(unit.product.variationMeta, packageValueId) ?? unit.product.title,
          codeCiphertext: unit.codeCiphertext,
        },
      });
      soldCount += 1;
      room -= 1;
    }

    if (soldCount > 0) {
      await this.audit.record({
        action: "admin.order.deliver_units",
        entityType: "order",
        entityId: orderId,
        metadata: { sold: soldCount },
      });
    }
  }

  private async fulfillPaid(orderId: string): Promise<void> {
    try {
      await this.fulfillment.fulfillPaidOrder(orderId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.startsWith("FULFILLMENT_")) {
        throw new BadRequestException("This order could not be completed. Check that its stock is still reserved.");
      }
      throw error;
    }
  }

  private async closeOpenPayments(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
    await tx.paymentIntent.updateMany({
      where: {
        orderId,
        status: {
          in: [PaymentIntentStatus.REQUIRES_CONFIRMATION, PaymentIntentStatus.PROCESSING],
        },
      },
      data: {
        status: PaymentIntentStatus.CANCELLED,
        failedAt: new Date(),
        failureReason: "Order completed by admin",
      },
    });
  }

  async updateCustomerInput(
    actorUserId: string,
    orderId: string,
    itemId: string,
    dto: AdminOrderCustomerInputDto,
  ): Promise<AdminOrderDetail> {
    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
    });
    if (!item) throw new NotFoundException("Order item not found");
    const answers = readStoredCustomerAnswers(item.customerInputs);
    const current = answers[dto.index];
    if (!current) throw new BadRequestException("That answer is not on this item");
    const value = dto.value.trim().slice(0, 500);
    if (!value) throw new BadRequestException("Enter a value before saving");
    answers[dto.index] = { label: current.label, value };
    await this.prisma.orderItem.update({
      where: { id: item.id },
      data: { customerInputs: answers as unknown as Prisma.InputJsonValue },
    });
    await this.audit.record({
      action: "admin.order.customer_input",
      userId: actorUserId,
      entityType: "order",
      entityId: orderId,
      metadata: { itemId, label: current.label },
    });
    return this.get(orderId);
  }

  async sendCustomerNote(
    actorUserId: string,
    orderId: string,
    dto: AdminOrderCustomerNoteDto,
    storefront?: string,
  ): Promise<{ delivered: boolean; detail: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { user: { select: { id: true, email: true, isGuest: true } } },
    });
    if (!order) throw new NotFoundException("Order not found");

    const shop = order.storefront === "uniqbd" ? "uniqbd" : "amarpin";
    const readiness = await this.mail.readiness(shop);
    const external = readiness.ready && readiness.provider !== "dev" && readiness.provider !== "noop";
    let delivered = false;
    let detail = "Email provider is not configured, so the note was not emailed to the customer.";
    const noteTo = order.contactEmail?.trim() || (order.user.isGuest ? "" : order.user.email);
    if (external && noteTo) {
      const result = await this.mail.sendStaffReply({
        kind: "order_note",
        to: noteTo,
        subject: `Message about order ${order.orderNumber}`,
        text: dto.message.trim(),
        actorUserId,
        storefront: shop,
      });
      delivered = result.delivered;
      detail = delivered
        ? "Note emailed to the customer."
        : "The mail provider did not accept the note.";
    } else if (external) {
      detail = "This order has no contact email, so the note was not emailed.";
    }

    await this.audit.record({
      action: "admin.order.customer_note",
      userId: actorUserId,
      entityType: "order",
      entityId: orderId,
      metadata: {
        senderType: dto.senderType,
        delivered,
        provider: readiness.provider,
      },
    });

    return { delivered, detail };
  }

  private mapListItem(row: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    fulfillmentStatus: AdminOrderListItem["fulfillmentStatus"] | string;
    totalMinor: number;
    currency: string;
    createdAt: Date;
    paidAt: Date | null;
    originChannel: string;
    originSource: string;
    storefront?: string;
    user: { id: string; email: string; displayName: string | null; isGuest?: boolean };
    contactName?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
    paymentIntents?: Array<{ paymentMethod: string | null; transactionId: string | null }>;
    items: Array<{
      quantity: number;
      titleSnapshot: string;
      unitPriceMinor?: number;
      product?: {
        variationMeta?: unknown;
        images?: Array<{ url: string }>;
      };
    }>;
  }): AdminOrderListItem {
    const productTitle = row.items
      .map((item) => item.titleSnapshot.trim())
      .filter(Boolean)
      .join(", ");
    const productImageUrl =
      row.items
        .map((item) => {
          const face =
            item.product && item.unitPriceMinor != null
              ? orderLineFace(item.product.variationMeta, item.unitPriceMinor).imageUrl
              : null;
          return (face || item.product?.images?.[0]?.url || "").trim();
        })
        .find(Boolean) ?? null;
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      status: row.status,
      fulfillmentStatus:
        row.fulfillmentStatus as AdminOrderListItem["fulfillmentStatus"],
      totalMinor: row.totalMinor,
      currency: row.currency,
      customerEmail:
        row.contactEmail?.trim() ||
        (row.user.isGuest ? "Guest checkout" : row.user.email),
      customerName: row.contactName?.trim() || row.user.displayName,
      customerId: row.user.id,
      itemCount: row.items.reduce((sum, item) => sum + item.quantity, 0),
      productTitle: productTitle || null,
      productImageUrl,
      origin: normalizeOriginSource(row.originSource),
      webDomain: row.storefront === "uniqbd" ? "uniqbd.com" : "amarpin.com",
      createdAt: row.createdAt.toISOString(),
      paidAt: row.paidAt?.toISOString() ?? null,
      paymentMethod: row.originChannel === "WALLET"
        ? "Wallet"
        : paymentMethodLabel(row.paymentIntents?.[0]?.paymentMethod),
      transactionId: row.originChannel === "WALLET" ? null : row.paymentIntents?.[0]?.transactionId ?? null,
    };
  }
}

function orderLineFace(variationMeta: unknown, unitPriceMinor: number) {
  const packages = readPublicPackages(variationMeta);
  const matches = packages.filter((pkg) => pkg.priceMinor === unitPriceMinor);
  const matched = matches[0] ?? (packages.length === 1 ? packages[0] : null);
  const meta =
    variationMeta && typeof variationMeta === "object" && !Array.isArray(variationMeta)
      ? (variationMeta as Record<string, unknown>)
      : null;
  const defaultRegion = typeof meta?.defaultRegion === "string" ? meta.defaultRegion.trim() : "";
  const productRegions = Array.isArray(meta?.regions)
    ? meta.regions.filter((region): region is string => typeof region === "string" && region.trim().length > 0)
    : [];
  return {
    imageUrl: matched?.imageUrl ?? null,
    packageName: matched?.name ?? null,
    region: matched?.region || defaultRegion || productRegions[0]?.trim() || null,
    deliveryLabel: matched
      ? matched.stockType === "manual"
        ? "Manual delivery"
        : "Instant delivery"
      : null,
  };
}

function packageName(meta: unknown, packageValueId: string | null | undefined) {
  if (!packageValueId) return null;
  const packages = readPublicPackages(meta);
  return packages.find((item) => item.valueId === packageValueId)?.name ?? null;
}

function packagePrice(meta: unknown, productPriceMinor: number, packageValueId: string | null) {
  if (!packageValueId) return productPriceMinor;
  const packages = readPublicPackages(meta);
  return packages.find((item) => item.valueId === packageValueId)?.priceMinor ?? productPriceMinor;
}

function packageFace(meta: unknown, packageValueId: string | null, title: string) {
  const packages = readPublicPackages(meta);
  const pack = packages.find((item) => item.valueId === packageValueId)
    ?? packages.find((item) => item.name === title.trim());
  const name = pack?.name ?? title;
  const dollars = name.match(/(\d+(?:\.\d+)?)\s*\$/);
  return {
    name,
    region: pack?.regions[0] ?? null,
    faceValue: dollars ? `${dollars[1]}$` : null,
  };
}
