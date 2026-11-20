import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import {
  FulfillmentStatus,
  InventoryStatus,
  OrderStatus,
  type Prisma,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { readPublicPackages, type ParsedProductPackage } from "../catalog/catalog.mapper";
import { AuditService } from "../../shared/audit/audit.service";
import { SmsGatewayService } from "../sms/sms.service";
import { MailService } from "../../shared/mail/mail.service";
import { planApiStockDelivery } from "./api-stock-order";
import {
  ORDERS_QUEUE,
  OrderJob,
  type FulfillOrderJobData,
} from "../../queues/queue.constants";

/**
 * Delivers reserved inventory for paid orders.
 * Idempotent: safe to retry; never logs plaintext codes.
 */
@Injectable()
export class FulfillmentService {
  private readonly logger = new Logger(FulfillmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sms: SmsGatewayService,
    private readonly mail: MailService,
    @InjectQueue(ORDERS_QUEUE) private readonly ordersQueue: Queue,
  ) {}

  async enqueueFulfillment(orderId: string): Promise<void> {
    if (!(await this.apiStockPending(orderId))) {
      this.logger.log(`Auto delivery skipped for orderId=${orderId}: package is not API stock`);
      return;
    }
    await this.ordersQueue.add(
      OrderJob.FulfillOrder,
      { orderId } satisfies FulfillOrderJobData,
      {
        jobId: `fulfill-order-${orderId}`,
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 8,
        backoff: { type: "exponential", delay: 3_000 },
      },
    );
  }

  /**
   * Delivers reserved API codes and completes the order, including when stock is short.
   * Throws when the write fails so the queue can retry. Gift-card reserves return "skip".
   */
  async deliverApiStock(orderId: string): Promise<"done" | "skip"> {
    const outcome = await this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<
          Array<{ id: string; status: OrderStatus; fulfillmentStatus: FulfillmentStatus }>
        >`
          SELECT id, status, "fulfillmentStatus"
          FROM orders
          WHERE id = ${orderId}
          FOR UPDATE
        `;
        const order = locked[0];
        if (!order) return "skip" as const;
        if (order.fulfillmentStatus === FulfillmentStatus.COMPLETED) return "already" as const;
        if (order.status === OrderStatus.PENDING_PAYMENT) {
          throw new Error(`API_STOCK_NOT_READY:${orderId}`);
        }
        if (order.status !== OrderStatus.PAID && order.status !== OrderStatus.FULFILLED) {
          return "skip" as const;
        }

        await this.claimPaidInventory(tx, orderId);

        const items = await tx.orderItem.findMany({
          where: { orderId },
          orderBy: { id: "asc" },
          select: {
            id: true,
            productId: true,
            quantity: true,
            unitPriceMinor: true,
            titleSnapshot: true,
            product: { select: { variationMeta: true } },
          },
        });
        const reserved = await tx.inventoryItem.findMany({
          where: { reservedOrderId: orderId, status: InventoryStatus.RESERVED },
          orderBy: { id: "asc" },
          select: { id: true, productId: true, packageValueId: true, codeCiphertext: true },
        });
        const metaByProduct = new Map(items.map((item) => [item.productId, item.product.variationMeta]));
        const plan = planApiStockDelivery(items, reserved, (productId, packageValueId) => {
          const pack = readPublicPackages(metaByProduct.get(productId)).find(
            (item) => item.valueId === packageValueId,
          );
          return pack ? { priceMinor: pack.priceMinor, stockType: pack.stockType } : null;
        });
        if (plan.action === "skip") return "skip" as const;

        const itemById = new Map(items.map((item) => [item.id, item]));
        const unitById = new Map(reserved.map((unit) => [unit.id, unit]));
        for (const row of plan.deliver) {
          const unit = unitById.get(row.unitId);
          const item = itemById.get(row.orderItemId);
          if (!unit || !item) throw new Error(`API_STOCK_MISSING:${orderId}`);
          const existing = await tx.orderDelivery.findUnique({
            where: { inventoryItemId: unit.id },
          });
          if (!existing) {
            await tx.orderDelivery.create({
              data: {
                orderId,
                orderItemId: item.id,
                inventoryItemId: unit.id,
                productId: unit.productId,
                titleSnapshot: item.titleSnapshot,
                codeCiphertext: unit.codeCiphertext,
              },
            });
          }
          const sold = await tx.inventoryItem.updateMany({
            where: { id: unit.id, status: InventoryStatus.RESERVED, reservedOrderId: orderId },
            data: { status: InventoryStatus.SOLD, reservedUntil: null },
          });
          if (sold.count !== 1 && !existing) throw new Error(`API_STOCK_RACE:${unit.id}`);
        }

        if (plan.release.length > 0) {
          await tx.inventoryItem.updateMany({
            where: { id: { in: plan.release }, status: InventoryStatus.RESERVED, reservedOrderId: orderId },
            data: { status: InventoryStatus.AVAILABLE, reservedOrderId: null, reservedUntil: null },
          });
        }

        await tx.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.FULFILLED,
            fulfillmentStatus: FulfillmentStatus.COMPLETED,
            fulfilledAt: new Date(),
          },
        });
        await this.recordStatus(tx, {
          orderId,
          fromStatus: order.status,
          toStatus: OrderStatus.FULFILLED,
          reason: "fulfillment.completed",
        });
        return "done" as const;
      },
      { isolationLevel: "Serializable", timeout: 20_000 },
    );

    if (outcome === "done") {
      await this.audit.record({
        action: "order.fulfilled",
        metadata: { orderId, source: "api-stock" },
      });
      this.sms.notifyOrderCompleted(orderId);
      this.mail.notifyOrderCompleted(orderId);
      this.logger.log(`API stock fulfilled orderId=${orderId}`);
    }
    return outcome === "skip" ? "skip" : "done";
  }

  async completeApiStockOrder(orderId: string): Promise<boolean> {
    return (await this.deliverApiStock(orderId)) === "done";
  }

  private async apiStockPending(orderId: string): Promise<boolean> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        items: {
          select: {
            id: true,
            quantity: true,
            unitPriceMinor: true,
            packageValueId: true,
            product: { select: { variationMeta: true } },
            deliveries: { select: { id: true } },
          },
        },
      },
    });
    if (!order) return false;
    return order.items.some((item) => {
      const pack = packageForLine(item.product.variationMeta, item.packageValueId, item.unitPriceMinor);
      return pack?.stockType === "api" && item.deliveries.length < item.quantity;
    });
  }

  notifyOrderCompleted(orderId: string): void {
    this.sms.notifyOrderCompleted(orderId);
    this.mail.notifyOrderCompleted(orderId);
  }

  async tryEnqueueFulfillment(orderId: string): Promise<boolean> {
    try {
      await this.enqueueFulfillment(orderId);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to enqueue fulfillment for orderId=${orderId}: ${message}`,
      );
      return false;
    }
  }

  async fulfillPaidOrder(orderId: string): Promise<void> {
    const fulfilled = await this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<
          Array<{
            id: string;
            status: OrderStatus;
            fulfillmentStatus: FulfillmentStatus;
          }>
        >`
          SELECT id, status, "fulfillmentStatus"
          FROM orders
          WHERE id = ${orderId}
          FOR UPDATE
        `;
        const order = locked[0];
        if (!order) return false;

        if (order.fulfillmentStatus === FulfillmentStatus.COMPLETED) {
          if (order.status === OrderStatus.PAID) {
            await tx.order.update({
              where: { id: orderId },
              data: {
                status: OrderStatus.FULFILLED,
                fulfilledAt: new Date(),
              },
            });
            await this.recordStatus(tx, {
              orderId,
              fromStatus: OrderStatus.PAID,
              toStatus: OrderStatus.FULFILLED,
              reason: "admin.complete",
            });
            return true;
          }
          return false;
        }

        if (
          order.status !== OrderStatus.PAID &&
          order.status !== OrderStatus.FULFILLED
        ) {
          this.logger.warn(
            `Skip fulfillment — orderId=${orderId} status=${order.status}`,
          );
          return false;
        }

        await tx.order.update({
          where: { id: orderId },
          data: { fulfillmentStatus: FulfillmentStatus.IN_PROGRESS },
        });

        await this.claimPaidInventory(tx, orderId);

        const reserved = await tx.inventoryItem.findMany({
          where: {
            reservedOrderId: orderId,
            status: InventoryStatus.RESERVED,
          },
          orderBy: { id: "asc" },
        });

        const orderItems = await tx.orderItem.findMany({
          where: { orderId },
          orderBy: { id: "asc" },
        });

        const remainingByProduct = new Map<string, string[]>();
        for (const item of orderItems) {
          const slots = remainingByProduct.get(item.productId) ?? [];
          for (let i = 0; i < item.quantity; i += 1) {
            slots.push(item.id);
          }
          remainingByProduct.set(item.productId, slots);
        }

        for (const unit of reserved) {
          const existing = await tx.orderDelivery.findUnique({
            where: { inventoryItemId: unit.id },
          });
          if (existing) {
            if (unit.status !== InventoryStatus.SOLD) {
              await tx.inventoryItem.update({
                where: { id: unit.id },
                data: {
                  status: InventoryStatus.SOLD,
                  reservedUntil: null,
                },
              });
            }
            continue;
          }

          const slots = remainingByProduct.get(unit.productId) ?? [];
          const orderItemId = slots.shift();
          remainingByProduct.set(unit.productId, slots);
          if (!orderItemId) {
            throw new Error(`FULFILLMENT_MISMATCH:${orderId}:${unit.productId}`);
          }

          const orderItem = orderItems.find((row) => row.id === orderItemId);
          if (!orderItem) {
            throw new Error(`FULFILLMENT_MISSING_ITEM:${orderItemId}`);
          }

          // Persist encrypted ciphertext only — never decrypt here.
          await tx.orderDelivery.create({
            data: {
              orderId,
              orderItemId,
              inventoryItemId: unit.id,
              productId: unit.productId,
              titleSnapshot: orderItem.titleSnapshot,
              codeCiphertext: unit.codeCiphertext,
            },
          });

          const sold = await tx.inventoryItem.updateMany({
            where: {
              id: unit.id,
              status: InventoryStatus.RESERVED,
              reservedOrderId: orderId,
            },
            data: {
              status: InventoryStatus.SOLD,
              reservedUntil: null,
            },
          });
          if (sold.count !== 1) {
            throw new Error(`FULFILLMENT_STOCK_RACE:${unit.id}`);
          }
        }

        const fromStatus = order.status;
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.FULFILLED,
            fulfillmentStatus: FulfillmentStatus.COMPLETED,
            fulfilledAt: new Date(),
          },
        });

        await this.recordStatus(tx, {
          orderId,
          fromStatus,
          toStatus: OrderStatus.FULFILLED,
          reason: "fulfillment.completed",
        });
        return true;
      },
      { isolationLevel: "Serializable", timeout: 20_000 },
    );

    if (!fulfilled) return;

    await this.audit.record({
      action: "order.fulfilled",
      metadata: { orderId },
    });
    this.sms.notifyOrderCompleted(orderId);
    this.logger.log(`Fulfilled orderId=${orderId}`);
  }

  /**
   * Locks available codes onto a paid order. Unpaid checkout never calls this.
   * A short claim is kept; delivery still completes with whatever was locked.
   */
  private async claimPaidInventory(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
    const items = await tx.orderItem.findMany({
      where: { orderId },
      orderBy: { id: "asc" },
      select: {
        productId: true,
        quantity: true,
        unitPriceMinor: true,
        packageValueId: true,
        product: { select: { variationMeta: true } },
      },
    });

    const groups = new Map<string, { productId: string; packageValueId: string | null; quantity: number }>();
    for (const item of items) {
      const packages = readPublicPackages(item.product.variationMeta);
      const pack = packageForLine(item.product.variationMeta, item.packageValueId, item.unitPriceMinor);
      if (pack?.stockType === "manual") continue;
      if (!pack && packages.length > 0 && packages.every((row) => row.stockType === "manual")) continue;
      const packageValueId = pack?.valueId ?? item.packageValueId ?? null;
      const key = `${item.productId}\0${packageValueId ?? ""}`;
      const group = groups.get(key) ?? { productId: item.productId, packageValueId, quantity: 0 };
      group.quantity += item.quantity;
      groups.set(key, group);
    }

    for (const group of groups.values()) {
      const held = await tx.inventoryItem.count({
        where: {
          reservedOrderId: orderId,
          productId: group.productId,
          ...(group.packageValueId ? { packageValueId: group.packageValueId } : {}),
          status: { in: [InventoryStatus.RESERVED, InventoryStatus.SOLD] },
        },
      });
      const need = group.quantity - held;
      if (need <= 0) continue;

      const rows = group.packageValueId
        ? await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id
            FROM inventory_items
            WHERE "productId" = ${group.productId}
              AND "packageValueId" = ${group.packageValueId}
              AND status = CAST('AVAILABLE' AS "InventoryStatus")
            ORDER BY id ASC
            FOR UPDATE SKIP LOCKED
            LIMIT ${need}
          `
        : await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id
            FROM inventory_items
            WHERE "productId" = ${group.productId}
              AND status = CAST('AVAILABLE' AS "InventoryStatus")
            ORDER BY id ASC
            FOR UPDATE SKIP LOCKED
            LIMIT ${need}
          `;
      if (rows.length === 0) continue;

      await tx.inventoryItem.updateMany({
        where: { id: { in: rows.map((row) => row.id) }, status: InventoryStatus.AVAILABLE },
        data: {
          status: InventoryStatus.RESERVED,
          reservedOrderId: orderId,
          reservedUntil: null,
        },
      });
    }
  }

  async recordStatus(
    tx: Prisma.TransactionClient,
    input: {
      orderId: string;
      fromStatus: OrderStatus | null;
      toStatus: OrderStatus;
      reason?: string;
    },
  ): Promise<void> {
    await tx.orderStatusHistory.create({
      data: {
        orderId: input.orderId,
        fromStatus: input.fromStatus ?? undefined,
        toStatus: input.toStatus,
        reason: input.reason,
      },
    });
  }
}

function packageForLine(
  variationMeta: unknown,
  packageValueId: string | null,
  unitPriceMinor: number,
): ParsedProductPackage | null {
  const packages = readPublicPackages(variationMeta);
  if (packageValueId) {
    return packages.find((row) => row.valueId === packageValueId) ?? null;
  }
  const priced = packages.filter((row) => row.priceMinor === unitPriceMinor);
  if (priced.length === 1) return priced[0] ?? null;
  return priced.find((row) => row.stockType !== "manual") ?? null;
}
