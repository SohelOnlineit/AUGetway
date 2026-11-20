import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  forwardRef,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import type { PublicOrderDetail, PublicOrderSummary } from "@amarpin/types";
import { normalizeOriginSource } from "@amarpin/types";
import { Queue } from "bullmq";
import type { PublicOrderDelivery } from "@amarpin/types";
import {
  FulfillmentStatus,
  InventoryStatus,
  OrderStatus,
  PaymentIntentStatus,
  WalletTransactionType,
  type Prisma,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../shared/audit/audit.service";
import { CryptoService } from "../../shared/crypto/crypto.service";
import { RedisService } from "../../shared/redis/redis.service";
import { CartService } from "../cart/cart.service";
import { CouponsService } from "../promotions/coupons.service";
import { PointsService } from "../points/points.service";
import { WalletService } from "../wallet/wallet.service";
import {
  ORDERS_QUEUE,
  OrderJob,
  type ExpireReservationJobData,
} from "../../queues/queue.constants";
import { resolveStorefrontId } from "../catalog/storefronts";
import { deliveryCardFace } from "../catalog/catalog.mapper";
import { TelegramService } from "../telegram/telegram.service";
import { MailService } from "../../shared/mail/mail.service";
import { FulfillmentService } from "./fulfillment.service";
import { PaymentsService } from "../payments/payments.service";
import { mapOrderDetail, mapOrderSummary } from "./orders.mapper";

const RESERVATION_TTL_MS = 30 * 60 * 1000; // 30 minutes

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly coupons: CouponsService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly crypto: CryptoService,
    private readonly fulfillment: FulfillmentService,
    private readonly wallet: WalletService,
    private readonly points: PointsService,
    private readonly telegram: TelegramService,
    private readonly mail: MailService,
    @Inject(forwardRef(() => PaymentsService))
    private readonly payments: PaymentsService,
    @InjectQueue(ORDERS_QUEUE) private readonly ordersQueue: Queue,
  ) {}

  async listForUser(userId: string): Promise<PublicOrderSummary[]> {
    const orders = await this.prisma.order.findMany({
      where: { userId, trashedAt: null },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
    return orders.map(mapOrderSummary);
  }

  async getForUser(userId: string, orderId: string): Promise<PublicOrderDetail> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        deliveries: {
          include: {
            inventoryItem: {
              select: {
                packageValueId: true,
                product: { select: { variationMeta: true } },
              },
            },
          },
        },
        refunds: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.userId !== userId || order.trashedAt) {
      // Same response shape as not found — avoid IDOR oracle.
      throw new NotFoundException("Order not found");
    }
    const detail = mapOrderDetail(order, this.revealDeliveriesForOwner(order));
    if (order.originChannel === "WALLET") {
      return { ...detail, paymentMethod: "Wallet", transactionId: null };
    }
    const gateway = await this.payments.gatewayPaymentForOrder(order.id);
    return {
      ...detail,
      paymentMethod: gateway.method,
      transactionId: gateway.transactionId,
    };
  }

  async quoteCoupon(userId: string, code: string) {
    const cart = await this.cart.getCart(userId);
    if (cart.items.length === 0) {
      throw new BadRequestException("Cart is empty");
    }
    const lines = [];
    for (const item of cart.items) {
      const product = await this.cart.requireSellableProduct(item.productId);
      const unitPriceMinor = this.cart.unitPriceFor(product, item.packageValueId);
      lines.push({
        productId: product.id,
        categoryId: product.categoryId,
        lineTotalMinor: unitPriceMinor * item.quantity,
        currency: product.currency,
      });
    }
    return this.coupons.quoteForUser(userId, code, lines);
  }

  async checkout(
    userId: string,
    idempotencyKey: string,
    couponCode?: string,
    paymentMethod?: "gateway" | "wallet",
    originSource?: string,
    actor?: {
      isGuest?: boolean;
      contactName?: string;
      contactPhone?: string;
      contactEmail?: string;
    },
    storefront?: string,
  ): Promise<PublicOrderDetail> {
    const shop = resolveStorefrontId(storefront);
    const isGuest = actor?.isGuest === true;
    const contactName = actor?.contactName?.trim().slice(0, 80) || null;
    const contactPhone = actor?.contactPhone?.trim().slice(0, 30) || null;
    const contactEmail = actor?.contactEmail?.trim().toLowerCase().slice(0, 120) || null;
    if (isGuest && paymentMethod === "wallet") {
      throw new BadRequestException("Sign in to pay with wallet.");
    }
    if (
      isGuest &&
      (!contactName ||
        contactName.length < 2 ||
        !contactPhone ||
        contactPhone.length < 6 ||
        !contactEmail ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
    ) {
      throw new BadRequestException(
        "Please fill in full name, mobile number, and email address.",
      );
    }

    await this.assertRedisReadyForCheckout();

    const existing = await this.prisma.order.findUnique({
      where: {
        userId_idempotencyKey: { userId, idempotencyKey },
      },
      include: { items: true },
    });
    if (existing) {
      if (paymentMethod === "wallet" && existing.status === OrderStatus.PENDING_PAYMENT) {
        await this.settleWithWallet(userId, existing.id);
      }
      return this.getForUser(userId, existing.id);
    }

    if (isGuest) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { displayName: contactName, phone: contactPhone },
      });
    }

    const cart = await this.cart.getCart(userId);
    if (cart.items.length === 0) {
      throw new BadRequestException("Cart is empty");
    }

    // Re-validate live price + availability before reserving.
    const lines: Array<{
      productId: string;
      categoryId: string;
      title: string;
      slug: string;
      unitPriceMinor: number;
      quantity: number;
      lineTotalMinor: number;
      currency: string;
      packageValueId: string | null;
      customerInputs: Array<{ label: string; value: string }>;
    }> = [];

    for (const item of cart.items) {
      const product = await this.cart.requireSellableProduct(item.productId);
      const unitPriceMinor = this.cart.unitPriceFor(product, item.packageValueId);
      if (unitPriceMinor !== item.unitPriceMinor) {
        throw new BadRequestException(
          `Price changed for “${product.title}”. Refresh your cart and try again.`,
        );
      }
      const selected = item.packageValueId
        ? this.cart.resolvePackage(product.variationMeta, item.packageValueId)
        : null;
      this.cart.assertCustomerAnswers(
        product.variationMeta,
        item.customerInputs,
        product.title,
      );
      const available = await this.cart.availableFor(product.id, selected);
      if (item.quantity > available) {
        throw new BadRequestException(
          `Insufficient stock for “${product.title}” (available ${available}).`,
        );
      }
      lines.push({
        productId: product.id,
        categoryId: product.categoryId,
        title: product.title,
        slug: product.slug,
        unitPriceMinor,
        quantity: item.quantity,
        lineTotalMinor: unitPriceMinor * item.quantity,
        currency: product.currency,
        packageValueId: selected?.valueId ?? null,
        customerInputs: item.customerInputs,
      });
    }

    const subtotalMinor = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
    const currency = lines[0]?.currency ?? "BDT";
    const reservationExpiresAt = new Date(Date.now() + RESERVATION_TTL_MS);

    let orderId = "";
    try {
      orderId = await this.prisma.$transaction(
        async (tx) => {
          const quote = couponCode?.trim()
            ? await this.coupons.quoteLocked(tx, userId, couponCode, lines)
            : null;
          const discountMinor = quote?.discountMinor ?? 0;
          const totalMinor = subtotalMinor - discountMinor;
          const orderNumber = await this.nextOrderNumber(tx);
          const order = await tx.order.create({
            data: {
              orderNumber,
              userId,
              status: OrderStatus.PENDING_PAYMENT,
              currency,
              subtotalMinor,
              discountMinor,
              totalMinor,
              couponId: quote?.couponId ?? null,
              couponCode: quote?.code ?? null,
              originChannel: paymentMethod === "wallet" ? "WALLET" : "DIRECT",
              originSource: normalizeOriginSource(originSource),
              storefront: shop,
              contactName,
              contactPhone,
              contactEmail,
              idempotencyKey,
              reservationExpiresAt,
              items: {
                create: lines.map((line) => ({
                  productId: line.productId,
                  titleSnapshot: line.title,
                  slugSnapshot: line.slug,
                  unitPriceMinor: line.unitPriceMinor,
                  quantity: line.quantity,
                  lineTotalMinor: line.lineTotalMinor,
                  packageValueId: line.packageValueId,
                  customerInputs: line.customerInputs.length ? line.customerInputs : undefined,
                })),
              },
            },
          });

          if (quote) {
            await this.coupons.recordHold(tx, {
              couponId: quote.couponId,
              orderId: order.id,
              userId,
              discountMinor,
              idempotencyKey,
            });
          }

          await tx.cartItem.deleteMany({
            where: { cart: { userId } },
          });

          return order.id;
        },
        {
          isolationLevel: "Serializable",
          timeout: 15_000,
        },
      );
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        const raced = await this.prisma.order.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey } },
          include: { items: true },
        });
        if (raced) return mapOrderDetail(raced, []);
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Checkout failed for userId=${userId}: ${message}`);
      throw error;
    }

    const delay = Math.max(reservationExpiresAt.getTime() - Date.now(), 1_000);
    await this.ordersQueue.add(
      OrderJob.ExpireReservation,
      { orderId } satisfies ExpireReservationJobData,
      {
        delay,
        jobId: `expire-reservation-${orderId}`,
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
      },
    );

    await this.audit.record({
      action: "order.checkout",
      userId,
      metadata: { orderId, status: OrderStatus.PENDING_PAYMENT, paymentMethod: paymentMethod ?? "gateway" },
    });

    if (paymentMethod === "wallet") {
      try {
        await this.settleWithWallet(userId, orderId);
      } finally {
        this.telegram.notifyOrder(shop, orderId);
        this.mail.notifyNewOrder(shop, orderId);
      }
    } else {
      this.telegram.notifyOrder(shop, orderId);
      this.mail.notifyNewOrder(shop, orderId);
    }

    return this.getForUser(userId, orderId);
  }

  private async settleWithWallet(userId: string, orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== userId) throw new NotFoundException("Order not found");
    if (order.status === OrderStatus.PAID || order.status === OrderStatus.FULFILLED) return;
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException("Order is not awaiting payment");
    }

    if (order.totalMinor > 0) {
      try {
        await this.wallet.postLedgerEntry({
          userId,
          type: WalletTransactionType.DEBIT,
          amountMinor: order.totalMinor,
          currency: order.currency,
          idempotencyKey: `wallet-order:${order.id}`,
          referenceType: "order",
          referenceId: order.id,
          description: `Order ${order.orderNumber}`,
          auditAction: "wallet.order_payment",
          actorUserId: userId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("Insufficient")) {
          await this.cancelUnpaidOrder(order.id, "wallet.insufficient_balance");
        }
        throw error;
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({ where: { id: orderId } });
      if (!current || current.status !== OrderStatus.PENDING_PAYMENT) return;
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.PAID,
          fulfillmentStatus: FulfillmentStatus.PENDING,
          paidAt: new Date(),
        },
      });
      await this.fulfillment.recordStatus(tx, {
        orderId,
        fromStatus: OrderStatus.PENDING_PAYMENT,
        toStatus: OrderStatus.PAID,
        reason: "wallet.paid",
      });
      await this.coupons.consumeHeld(tx, orderId);
    });

    try {
      await this.fulfillment.completeApiStockOrder(orderId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`API stock delivery failed for orderId=${orderId}: ${message}`);
      await this.fulfillment.enqueueFulfillment(orderId);
    }
    await this.points.syncOrder(orderId);
  }

  private async cancelUnpaidOrder(orderId: string, reason: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order || order.status !== OrderStatus.PENDING_PAYMENT) return;
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
      });
      await this.fulfillment.recordStatus(tx, {
        orderId,
        fromStatus: OrderStatus.PENDING_PAYMENT,
        toStatus: OrderStatus.CANCELLED,
        reason,
      });
      await this.coupons.releaseHeld(tx, orderId);
      await tx.inventoryItem.updateMany({
        where: { reservedOrderId: orderId, status: InventoryStatus.RESERVED },
        data: { status: InventoryStatus.AVAILABLE, reservedOrderId: null, reservedUntil: null },
      });
    });
  }

  async expireReservation(orderId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) return;
      if (order.status !== OrderStatus.PENDING_PAYMENT) return;
      if (order.reservationExpiresAt.getTime() > Date.now()) return;

      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
      });

      await this.fulfillment.recordStatus(tx, {
        orderId,
        fromStatus: OrderStatus.PENDING_PAYMENT,
        toStatus: OrderStatus.CANCELLED,
        reason: "reservation.expired",
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
          status: PaymentIntentStatus.EXPIRED,
          failedAt: new Date(),
          failureReason: "Order reservation expired",
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
      action: "order.reservation_expired",
      metadata: { orderId },
    });
    this.logger.log(`Released reservation for orderId=${orderId}`);
  }

  /**
   * Reveal plaintext delivery codes only to the owning customer for paid/fulfilled orders.
   * Ciphertext stays in DB; plaintext is never written to logs.
   */
  private revealDeliveriesForOwner(order: {
    status: OrderStatus;
    deliveries: Array<{
      id: string;
      orderItemId: string;
      productId: string;
      titleSnapshot: string;
      codeCiphertext: string;
      deliveredAt: Date;
      inventoryItem?: {
        packageValueId: string | null;
        product: { variationMeta: unknown };
      } | null;
    }>;
  }): PublicOrderDelivery[] {
    if (
      order.status !== OrderStatus.PAID &&
      order.status !== OrderStatus.FULFILLED &&
      order.status !== OrderStatus.PARTIALLY_REFUNDED &&
      order.status !== OrderStatus.REFUNDED
    ) {
      return [];
    }
    if (!order.deliveries?.length) return [];

    const revealed: PublicOrderDelivery[] = [];
    for (const delivery of order.deliveries) {
      try {
        const code = this.crypto.decryptSecret(delivery.codeCiphertext);
        const face = deliveryCardFace(
          delivery.inventoryItem?.product.variationMeta,
          delivery.inventoryItem?.packageValueId,
          delivery.titleSnapshot,
        );
        revealed.push({
          id: delivery.id,
          orderItemId: delivery.orderItemId,
          productId: delivery.productId,
          titleSnapshot: delivery.titleSnapshot,
          packageName: face.name,
          region: face.region,
          code,
          deliveredAt: delivery.deliveredAt.toISOString(),
        });
      } catch {
        this.logger.error(
          `Failed to decrypt delivery id=${delivery.id} (ciphertext only logged by id)`,
        );
      }
    }
    return revealed;
  }

  private async assertRedisReadyForCheckout(): Promise<void> {
    const nodeEnv = this.config.get<string>("app.nodeEnv") ?? "development";
    try {
      await Promise.race([
        (async () => {
          const ok = await this.redis.ping();
          if (!ok) throw new Error("unexpected ping");
          await this.ordersQueue.waitUntilReady();
        })(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("redis timeout")), 4_000);
        }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Checkout blocked — Redis/queue unavailable: ${message}`);
      if (nodeEnv === "production") {
        throw new ServiceUnavailableException(
          "Checkout temporarily unavailable. Please try again shortly.",
        );
      }
      // Still fail closed outside production for this commerce path —
      // reservation expiry depends on BullMQ.
      throw new ServiceUnavailableException(
        "Checkout requires Redis + BullMQ. Start Redis and retry.",
      );
    }
  }

  private async nextOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    await tx.orderNumberSequence.upsert({
      where: { id: "default" },
      create: { id: "default", nextValue: 1000 },
      update: {},
    });
    const updated = await tx.$queryRaw<Array<{ nextValue: number }>>`
      UPDATE order_number_sequences
      SET "nextValue" = "nextValue" + 1
      WHERE id = 'default'
      RETURNING "nextValue" - 1 AS "nextValue"
    `;
    const value = updated[0]?.nextValue ?? 1000;
    return String(value);
  }

}
