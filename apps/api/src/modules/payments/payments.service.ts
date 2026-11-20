import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import type { PublicPaymentIntent } from "@amarpin/types";
import { Queue } from "bullmq";
import { randomUUID } from "node:crypto";
import {
  FulfillmentStatus,
  OrderStatus,
  PaymentEventKind,
  PaymentIntentStatus,
  PaymentProvider,
  type PaymentIntent,
  type Prisma,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../shared/audit/audit.service";
import { RedisService } from "../../shared/redis/redis.service";
import { FulfillmentService } from "../orders/fulfillment.service";
import { PointsService } from "../points/points.service";
import { CouponsService } from "../promotions/coupons.service";
import {
  PAYMENTS_QUEUE,
  PaymentJob,
  type ReconcileFulfillmentJobData,
  type VerifyIntentJobData,
} from "../../queues/queue.constants";
import {
  PAYMENT_PORT,
  type PaymentPort,
  type SandboxOutcome,
} from "./payment.port";
import { PaymentGatewaySettingsService } from "./payment-gateway-settings.service";
import { SandboxPaymentProvider } from "./sandbox-payment.provider";
import { invoiceIdFromPaymentUrl, paymentMethodLabel, readPaymentFacts, UddoktapayClient } from "./uddoktapay.client";

const INTENT_TTL_MS = 25 * 60 * 1000;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly fulfillment: FulfillmentService,
    private readonly coupons: CouponsService,
    private readonly points: PointsService,
    @Inject(PAYMENT_PORT) private readonly paymentPort: PaymentPort,
    @InjectQueue(PAYMENTS_QUEUE) private readonly paymentsQueue: Queue,
    private readonly gateways: PaymentGatewaySettingsService,
    private readonly uddoktapay: UddoktapayClient,
  ) {}

  isSandboxUiAllowed(): boolean {
    return SandboxPaymentProvider.isSandboxRuntimeAllowed(this.config);
  }

  async createIntentForUser(
    userId: string,
    orderId: string,
    idempotencyKey: string,
  ): Promise<PublicPaymentIntent> {
    const gateway = await this.gateways.getRuntime();
    const chargeGateway = gateway.enabled && Boolean(gateway.baseUrl) && Boolean(gateway.apiKey);
    if (!chargeGateway) this.assertSandboxEnvironment();
    await this.assertRedisReady("create payment intent");

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { user: { select: { email: true, displayName: true } } },
    });
    if (!order || order.userId !== userId) {
      throw new NotFoundException("Order not found");
    }
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException("Order is cancelled");
    }
    if (
      order.status === OrderStatus.PAID ||
      order.status === OrderStatus.FULFILLED
    ) {
      const existingPaid = await this.prisma.paymentIntent.findFirst({
        where: { orderId, status: PaymentIntentStatus.SUCCEEDED },
        orderBy: { createdAt: "desc" },
      });
      if (existingPaid) {
        return await this.toPublic(existingPaid, order.orderNumber);
      }
      throw new BadRequestException("Order is already paid");
    }
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException("Order is not awaiting payment");
    }
    if (order.reservationExpiresAt.getTime() <= Date.now()) {
      throw new BadRequestException("Order reservation expired");
    }

    const existing = await this.prisma.paymentIntent.findUnique({
      where: {
        orderId_idempotencyKey: { orderId, idempotencyKey },
      },
    });
    if (existing) {
      if (chargeGateway && existing.provider === PaymentProvider.SANDBOX) {
        return await this.upgradeSandboxIntent(existing, order, gateway.baseUrl, gateway.apiKey!);
      }
      return await this.toPublic(existing, order.orderNumber);
    }

    const open = await this.prisma.paymentIntent.findFirst({
      where: {
        orderId,
        status: {
          in: [
            PaymentIntentStatus.REQUIRES_CONFIRMATION,
            PaymentIntentStatus.PROCESSING,
          ],
        },
      },
      orderBy: { createdAt: "desc" },
    });
    if (open) {
      if (chargeGateway && open.provider === PaymentProvider.SANDBOX) {
        return await this.upgradeSandboxIntent(open, order, gateway.baseUrl, gateway.apiKey!);
      }
      return await this.toPublic(open, order.orderNumber);
    }

    const expiresAt = new Date(
      Math.min(
        Date.now() + INTENT_TTL_MS,
        order.reservationExpiresAt.getTime(),
      ),
    );

    let provider: PaymentProvider = PaymentProvider.SANDBOX;
    let externalRef: string | null = null;
    let checkoutUrl: string | null = null;
    if (chargeGateway && gateway.apiKey) {
      const charge = await this.uddoktapay.createCheckout({
        baseUrl: gateway.baseUrl,
        apiKey: gateway.apiKey,
        amountMinor: order.totalMinor,
        fullName: order.user.displayName?.trim() || "Customer",
        email: order.user.email,
        orderId,
        redirectUrl: `${this.gateways.appBase()}/checkout/pay/${orderId}`,
        cancelUrl: `${this.gateways.appBase()}/checkout/pay/${orderId}`,
        webhookUrl: `${this.gateways.callbackBase()}/payments/webhooks/uddoktapay`,
      });
      provider = PaymentProvider.UDDOKTAPAY;
      externalRef = charge.invoiceId;
      checkoutUrl = charge.paymentUrl;
    } else {
      const providerResult = await this.paymentPort.createIntent({
        orderId,
        amountMinor: order.totalMinor,
        currency: order.currency,
        idempotencyKey,
        expiresAt,
      });
      provider = providerResult.provider;
      externalRef = providerResult.externalRef;
    }

    let intent: PaymentIntent;
    try {
      intent = await this.prisma.paymentIntent.create({
        data: {
          orderId,
          provider,
          status: PaymentIntentStatus.REQUIRES_CONFIRMATION,
          amountMinor: order.totalMinor,
          currency: order.currency,
          idempotencyKey,
          externalRef,
          expiresAt,
          events: {
            create: {
              kind: PaymentEventKind.INTENT_CREATED,
              providerEventId: `created_${externalRef ?? idempotencyKey}`,
              metadata: checkoutUrl ? { provider, checkoutUrl } : { provider },
            },
          },
        },
      });
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        const raced = await this.prisma.paymentIntent.findUnique({
          where: { orderId_idempotencyKey: { orderId, idempotencyKey } },
        });
        if (raced) return await this.toPublic(raced, order.orderNumber);
      }
      throw error;
    }

    await this.scheduleVerify(intent.id, expiresAt);
    await this.audit.record({
      action: "payment.intent_created",
      userId,
      metadata: { paymentIntentId: intent.id, orderId, provider: intent.provider },
    });

    return await this.toPublic(intent, order.orderNumber);
  }

  async getIntentForUser(
    userId: string,
    paymentIntentId: string,
  ): Promise<PublicPaymentIntent> {
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { id: paymentIntentId },
      include: { order: true },
    });
    if (!intent || intent.order.userId !== userId) {
      throw new NotFoundException("Payment intent not found");
    }
    return await this.toPublic(intent, intent.order.orderNumber);
  }

  /**
   * Backend-only sandbox simulation. Client cannot mark payment successful;
   * it may only request a mock outcome in non-production.
   */
  async sandboxSimulateForUser(
    userId: string,
    paymentIntentId: string,
    outcome: SandboxOutcome = "success",
  ): Promise<PublicPaymentIntent> {
    this.assertSandboxEnvironment();
    await this.assertRedisReady("sandbox payment confirmation");

    const intent = await this.prisma.paymentIntent.findUnique({
      where: { id: paymentIntentId },
      include: { order: true },
    });
    if (!intent || intent.order.userId !== userId) {
      throw new NotFoundException("Payment intent not found");
    }
    if (intent.provider !== PaymentProvider.SANDBOX) {
      throw new BadRequestException("Intent is not a sandbox payment");
    }
    if (!intent.externalRef) {
      throw new BadRequestException("Sandbox intent missing external reference");
    }
    if (!this.paymentPort.simulateConfirmation) {
      throw new ServiceUnavailableException("Sandbox simulation unavailable");
    }

    if (intent.status === PaymentIntentStatus.SUCCEEDED) {
      return await this.toPublic(intent, intent.order.orderNumber);
    }

    const verification = await this.paymentPort.simulateConfirmation(
      intent.externalRef,
      outcome,
    );

    if (verification.status === "failed") {
      await this.markFailed(intent.id, verification.providerEventId, verification.failureReason);
      const failed = await this.prisma.paymentIntent.findUniqueOrThrow({
        where: { id: intent.id },
        include: { order: true },
      });
      return await this.toPublic(failed, failed.order.orderNumber);
    }

    await this.settleSucceeded({
      paymentIntentId: intent.id,
      providerEventId: verification.providerEventId,
      eventKind: PaymentEventKind.SANDBOX_SIMULATE,
      metadata: { outcome, source: "sandbox_simulate" },
    });

    const settled = await this.prisma.paymentIntent.findUniqueOrThrow({
      where: { id: intent.id },
      include: { order: true },
    });
    return await this.toPublic(settled, settled.order.orderNumber);
  }

  async verifyIntentJob(paymentIntentId: string): Promise<void> {
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { id: paymentIntentId },
      include: { order: true },
    });
    if (!intent) return;

    if (intent.status === PaymentIntentStatus.SUCCEEDED) {
      if (
        intent.order.fulfillmentStatus === FulfillmentStatus.PENDING ||
        intent.order.fulfillmentStatus === FulfillmentStatus.FAILED
      ) {
        try {
          await this.fulfillment.completeApiStockOrder(intent.orderId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`API stock delivery failed for orderId=${intent.orderId}: ${message}`);
          await this.fulfillment.tryEnqueueFulfillment(intent.orderId);
        }
      }
      return;
    }

    if (
      intent.status === PaymentIntentStatus.CANCELLED ||
      intent.status === PaymentIntentStatus.FAILED ||
      intent.status === PaymentIntentStatus.EXPIRED
    ) {
      return;
    }

    if (intent.expiresAt.getTime() <= Date.now()) {
      await this.markExpired(intent.id);
      return;
    }

    if (intent.provider === PaymentProvider.UDDOKTAPAY) {
      if (intent.externalRef && !isCheckoutSessionToken(intent.externalRef)) {
        await this.settleUddoktaInvoice(intent.id, intent.externalRef);
      }
      return;
    }

    if (!intent.externalRef) return;

    if (!this.isSandboxUiAllowed()) return;

    const verification = await this.paymentPort.verify(intent.externalRef);
    if (verification.status === "succeeded") {
      await this.settleSucceeded({
        paymentIntentId: intent.id,
        providerEventId: verification.providerEventId,
        eventKind: PaymentEventKind.VERIFIED,
        metadata: { source: "verify_job" },
      });
    } else if (verification.status === "failed") {
      await this.markFailed(
        intent.id,
        verification.providerEventId,
        verification.failureReason,
      );
    } else if (verification.status === "expired") {
      await this.markExpired(intent.id);
    }
  }

  async reconcileFulfillmentJob(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return;
    if (order.status !== OrderStatus.PAID && order.status !== OrderStatus.FULFILLED) {
      return;
    }
    if (order.fulfillmentStatus === FulfillmentStatus.COMPLETED) return;
    try {
      await this.fulfillment.completeApiStockOrder(orderId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`API stock delivery failed for orderId=${orderId}: ${message}`);
      await this.fulfillment.tryEnqueueFulfillment(orderId);
    }
  }

  /**
   * Atomic paid transition. Duplicate providerEventId is ignored safely.
   */
  async settleSucceeded(input: {
    paymentIntentId: string;
    providerEventId: string;
    eventKind: PaymentEventKind;
    metadata?: Prisma.InputJsonValue;
  }): Promise<void> {
    let orderId = "";
    let alreadySettled = false;

    try {
      await this.prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<
            Array<{
              id: string;
              orderId: string;
              status: PaymentIntentStatus;
            }>
          >`
            SELECT id, "orderId", status
            FROM payment_intents
            WHERE id = ${input.paymentIntentId}
            FOR UPDATE
          `;
          const intent = rows[0];
          if (!intent) throw new NotFoundException("Payment intent not found");
          orderId = intent.orderId;

          const duplicate = await tx.paymentEvent.findUnique({
            where: {
              paymentIntentId_providerEventId: {
                paymentIntentId: intent.id,
                providerEventId: input.providerEventId,
              },
            },
          });
          if (duplicate) {
            alreadySettled = intent.status === PaymentIntentStatus.SUCCEEDED;
            await tx.paymentEvent.create({
              data: {
                paymentIntentId: intent.id,
                kind: PaymentEventKind.DUPLICATE_IGNORED,
                providerEventId: `dup_${input.providerEventId}_${randomUUID().slice(0, 8)}`,
                metadata: { originalEventId: input.providerEventId },
              },
            });
            return;
          }

          if (intent.status === PaymentIntentStatus.SUCCEEDED) {
            alreadySettled = true;
            await tx.paymentEvent.create({
              data: {
                paymentIntentId: intent.id,
                kind: PaymentEventKind.DUPLICATE_IGNORED,
                providerEventId: input.providerEventId,
                metadata: input.metadata ?? undefined,
              },
            });
            return;
          }

          if (
            intent.status === PaymentIntentStatus.CANCELLED ||
            intent.status === PaymentIntentStatus.EXPIRED ||
            intent.status === PaymentIntentStatus.FAILED
          ) {
            throw new BadRequestException(
              `Payment intent cannot be settled from status ${intent.status}`,
            );
          }

          const orderRows = await tx.$queryRaw<
            Array<{ id: string; status: OrderStatus; userId: string }>
          >`
            SELECT id, status, "userId"
            FROM orders
            WHERE id = ${intent.orderId}
            FOR UPDATE
          `;
          const order = orderRows[0];
          if (!order) throw new NotFoundException("Order not found");
          if (order.status === OrderStatus.CANCELLED) {
            throw new BadRequestException("Order is cancelled");
          }

          await tx.paymentEvent.create({
            data: {
              paymentIntentId: intent.id,
              kind: input.eventKind,
              providerEventId: input.providerEventId,
              metadata: input.metadata ?? undefined,
            },
          });

          await tx.paymentIntent.update({
            where: { id: intent.id },
            data: {
              status: PaymentIntentStatus.SUCCEEDED,
              succeededAt: new Date(),
              failedAt: null,
              failureReason: null,
            },
          });

          await tx.paymentEvent.create({
            data: {
              paymentIntentId: intent.id,
              kind: PaymentEventKind.SETTLED,
              providerEventId: `settled_${input.providerEventId}`,
              metadata: { orderId: order.id },
            },
          });

          if (
            order.status === OrderStatus.PAID ||
            order.status === OrderStatus.FULFILLED
          ) {
            alreadySettled = true;
            return;
          }

          if (order.status !== OrderStatus.PENDING_PAYMENT) {
            throw new BadRequestException(
              `Order cannot be marked paid from status ${order.status}`,
            );
          }

          await tx.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.PAID,
              fulfillmentStatus: FulfillmentStatus.PENDING,
              paidAt: new Date(),
            },
          });

          await this.fulfillment.recordStatus(tx, {
            orderId: order.id,
            fromStatus: OrderStatus.PENDING_PAYMENT,
            toStatus: OrderStatus.PAID,
            reason: "payment.settled",
          });
          await this.coupons.consumeHeld(tx, order.id);

          // Cancel sibling open intents for the same order.
          await tx.paymentIntent.updateMany({
            where: {
              orderId: order.id,
              id: { not: intent.id },
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
              failureReason: "Superseded by successful payment",
            },
          });
        },
        { isolationLevel: "Serializable", timeout: 15_000 },
      );
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        this.logger.warn(
          `Duplicate payment event ignored for intent=${input.paymentIntentId}`,
        );
        return;
      }
      throw error;
    }

    if (!orderId) return;
    if (!alreadySettled) await this.points.syncOrder(orderId);

    await this.audit.record({
      action: alreadySettled ? "payment.duplicate_settled" : "payment.settled",
      metadata: {
        paymentIntentId: input.paymentIntentId,
        orderId,
        providerEventId: input.providerEventId,
      },
    });

    try {
      const completed = await this.fulfillment.completeApiStockOrder(orderId);
      if (completed) return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`API stock delivery failed for orderId=${orderId}: ${message}`);
      const enqueued = await this.fulfillment.tryEnqueueFulfillment(orderId);
      await this.scheduleReconcile(orderId, enqueued ? 60_000 : undefined);
    }
  }

  private async markFailed(
    paymentIntentId: string,
    providerEventId: string,
    failureReason?: string,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const intent = await tx.paymentIntent.findUnique({
          where: { id: paymentIntentId },
        });
        if (!intent) return;
        if (intent.status === PaymentIntentStatus.SUCCEEDED) return;

        await tx.paymentEvent.create({
          data: {
            paymentIntentId,
            kind: PaymentEventKind.FAILED,
            providerEventId,
            metadata: { failureReason: failureReason ?? "failed" },
          },
        });

        await tx.paymentIntent.update({
          where: { id: paymentIntentId },
          data: {
            status: PaymentIntentStatus.FAILED,
            failedAt: new Date(),
            failureReason: failureReason ?? "Payment failed",
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        return;
      }
      throw error;
    }
  }

  private async markExpired(paymentIntentId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const intent = await tx.paymentIntent.findUnique({
        where: { id: paymentIntentId },
      });
      if (!intent) return;
      if (
        intent.status === PaymentIntentStatus.SUCCEEDED ||
        intent.status === PaymentIntentStatus.EXPIRED ||
        intent.status === PaymentIntentStatus.CANCELLED
      ) {
        return;
      }

      await tx.paymentEvent.create({
        data: {
          paymentIntentId,
          kind: PaymentEventKind.EXPIRED,
          providerEventId: `expired_${paymentIntentId}_${Date.now()}`,
        },
      });

      await tx.paymentIntent.update({
        where: { id: paymentIntentId },
        data: {
          status: PaymentIntentStatus.EXPIRED,
          failedAt: new Date(),
          failureReason: "Payment intent expired",
        },
      });
    });
  }

  private async scheduleVerify(
    paymentIntentId: string,
    expiresAt: Date,
  ): Promise<void> {
    const delay = Math.min(
      Math.max(expiresAt.getTime() - Date.now(), 5_000),
      INTENT_TTL_MS,
    );
    await this.paymentsQueue.add(
      PaymentJob.VerifyIntent,
      { paymentIntentId } satisfies VerifyIntentJobData,
      {
        jobId: `verify-intent-${paymentIntentId}`,
        delay,
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: 5,
        backoff: { type: "exponential", delay: 5_000 },
      },
    );
  }

  private async scheduleReconcile(
    orderId: string,
    delayMs = 5_000,
  ): Promise<void> {
    try {
      await this.paymentsQueue.add(
        PaymentJob.ReconcileFulfillment,
        { orderId } satisfies ReconcileFulfillmentJobData,
        {
          jobId: `reconcile-fulfillment-${orderId}-${Math.floor(Date.now() / 60_000)}`,
          delay: delayMs,
          removeOnComplete: 100,
          removeOnFail: 200,
          attempts: 10,
          backoff: { type: "exponential", delay: 5_000 },
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to schedule fulfillment reconcile for orderId=${orderId}: ${message}`,
      );
    }
  }

  private assertSandboxEnvironment(): void {
    if (this.isSandboxUiAllowed()) return;
    throw new ForbiddenException(
      "Sandbox payments are disabled in this environment",
    );
  }

  private async assertRedisReady(action: string): Promise<void> {
    try {
      const ok = await this.redis.ping();
      if (!ok) throw new Error("unexpected ping");
      await this.paymentsQueue.waitUntilReady();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`${action} blocked — Redis/queue unavailable: ${message}`);
      throw new ServiceUnavailableException(
        "Payments temporarily unavailable. Please try again shortly.",
      );
    }
  }

  async confirmUddoktaForUser(
    userId: string,
    orderId: string,
    invoiceId?: string,
    reported?: { paymentMethod?: string; transactionId?: string },
  ) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== userId) throw new NotFoundException("Order not found");
    const intent = await this.prisma.paymentIntent.findFirst({
      where: { orderId, provider: PaymentProvider.UDDOKTAPAY },
      orderBy: { createdAt: "desc" },
    });
    if (!intent) throw new NotFoundException("Uddokta Pay payment not found");
    const hinted = invoiceId?.trim() || "";
    const stored = intent.externalRef && !isCheckoutSessionToken(intent.externalRef) ? intent.externalRef : "";
    const resolved = hinted || stored || (await this.invoiceFromEvents(intent.id)) || "";
    if (!resolved || isCheckoutSessionToken(resolved)) {
      return await this.toPublic(intent, order.orderNumber);
    }
    await this.settleUddoktaInvoice(intent.id, resolved, orderId);
    const settled = await this.prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } });
    if (settled.status === PaymentIntentStatus.SUCCEEDED) {
      const reportedFacts = readPaymentFacts({
        payment_method: reported?.paymentMethod,
        transaction_id: reported?.transactionId,
      });
      if (
        (reportedFacts.paymentMethod && !settled.paymentMethod) ||
        (reportedFacts.transactionId && !settled.transactionId)
      ) {
        await this.prisma.paymentIntent.update({
          where: { id: settled.id },
          data: {
            ...(settled.paymentMethod || !reportedFacts.paymentMethod ? {} : { paymentMethod: reportedFacts.paymentMethod }),
            ...(settled.transactionId || !reportedFacts.transactionId ? {} : { transactionId: reportedFacts.transactionId }),
          },
        });
      }
    }
    const next = await this.prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } });
    return await this.toPublic(next, order.orderNumber);
  }

  private async invoiceFromEvents(paymentIntentId: string): Promise<string | null> {
    const events = await this.prisma.paymentEvent.findMany({
      where: { paymentIntentId, kind: PaymentEventKind.INTENT_CREATED },
      orderBy: { createdAt: "desc" },
    });
    for (const event of events) {
      const meta = event.metadata;
      if (!meta || typeof meta !== "object" || !("checkoutUrl" in meta)) continue;
      const url = meta.checkoutUrl;
      if (typeof url !== "string") continue;
      const invoiceId = invoiceIdFromPaymentUrl(url);
      if (invoiceId) return invoiceId;
    }
    return null;
  }

  async handleUddoktaWebhook(body: unknown): Promise<void> {
    if (!body || typeof body !== "object") return;
    const record = body as Record<string, unknown>;
    const invoiceId =
      typeof record.invoice_id === "string"
        ? record.invoice_id
        : typeof record.invoiceId === "string"
          ? record.invoiceId
          : "";
    if (!invoiceId.trim()) return;
    const hintedOrderId = orderIdFromUddokta(record);
    const existing = await this.prisma.paymentIntent.findFirst({
      where: { provider: PaymentProvider.UDDOKTAPAY, externalRef: invoiceId.trim() },
    });
    const intent =
      existing ??
      (hintedOrderId
        ? await this.prisma.paymentIntent.findFirst({
            where: { orderId: hintedOrderId, provider: PaymentProvider.UDDOKTAPAY },
            orderBy: { createdAt: "desc" },
          })
        : null);
    if (!intent) return;
    // The webhook has no signature, so nothing in its body is stored. The payment
    // method and transaction id come from the gateway's own verify call below.
    try {
      await this.settleUddoktaInvoice(intent.id, invoiceId.trim(), intent.orderId);
    } catch (error) {
      if (error instanceof BadRequestException) return;
      throw error;
    }
  }

  private async settleUddoktaInvoice(
    paymentIntentId: string,
    invoiceId: string,
    expectedOrderId?: string,
  ): Promise<void> {
    const gateway = await this.gateways.getRuntime();
    if (!gateway.enabled || !gateway.apiKey || !gateway.baseUrl) return;
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id: paymentIntentId } });
    if (!intent || intent.provider !== PaymentProvider.UDDOKTAPAY) return;
    if (intent.status === PaymentIntentStatus.SUCCEEDED) {
      if (!intent.transactionId) await this.saveUddoktaFacts(intent.id, invoiceId);
      return;
    }
    // One paid invoice can settle only one order.
    const claimed = await this.prisma.paymentIntent.findFirst({
      where: {
        provider: PaymentProvider.UDDOKTAPAY,
        externalRef: invoiceId,
        id: { not: intent.id },
      },
      select: { id: true },
    });
    if (claimed) {
      throw new BadRequestException("Payment does not match this order");
    }
    const verified = await this.uddoktapay.verify(gateway.baseUrl, gateway.apiKey, invoiceId);
    if (verified.paymentMethod || verified.transactionId) {
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: {
          externalRef: intent.externalRef ?? invoiceId,
          ...(verified.paymentMethod ? { paymentMethod: verified.paymentMethod } : {}),
          ...(verified.transactionId ? { transactionId: verified.transactionId } : {}),
        },
      });
    }
    if (verified.orderId && verified.orderId !== intent.orderId) {
      throw new BadRequestException("Payment does not match this order");
    }
    if (expectedOrderId && expectedOrderId !== intent.orderId) {
      throw new BadRequestException("Payment does not match this order");
    }
    if (!intent.externalRef) {
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { externalRef: invoiceId },
      });
    }
    if (verified.status === "pending") return;
    if (verified.status === "failed") {
      await this.markFailed(intent.id, `uddokta_fail_${invoiceId}`, "Uddokta Pay reported a failed payment");
      return;
    }
    if (verified.amountMinor !== null && verified.amountMinor !== intent.amountMinor) {
      await this.markFailed(intent.id, `uddokta_amount_${invoiceId}`, "Payment amount did not match the order");
      return;
    }
    await this.settleSucceeded({
      paymentIntentId: intent.id,
      providerEventId: `uddokta_${invoiceId}`,
      eventKind: PaymentEventKind.VERIFIED,
      metadata: {
        source: "uddoktapay",
        invoiceId,
        ...(verified.paymentMethod ? { payment_method: verified.paymentMethod } : {}),
        ...(verified.transactionId ? { transaction_id: verified.transactionId } : {}),
      },
    });
  }

  private async upgradeSandboxIntent(
    intent: PaymentIntent,
    order: { id: string; orderNumber: string; totalMinor: number; user: { email: string; displayName: string | null } },
    baseUrl: string,
    apiKey: string,
  ): Promise<PublicPaymentIntent> {
    const charge = await this.uddoktapay.createCheckout({
      baseUrl,
      apiKey,
      amountMinor: order.totalMinor,
      fullName: order.user.displayName?.trim() || "Customer",
      email: order.user.email,
      orderId: order.id,
      redirectUrl: `${this.gateways.appBase()}/checkout/pay/${order.id}`,
      cancelUrl: `${this.gateways.appBase()}/checkout/pay/${order.id}`,
      webhookUrl: `${this.gateways.callbackBase()}/payments/webhooks/uddoktapay`,
    });
    const upgraded = await this.prisma.paymentIntent.update({
      where: { id: intent.id },
      data: {
        provider: PaymentProvider.UDDOKTAPAY,
        externalRef: charge.invoiceId,
        events: {
          create: {
            kind: PaymentEventKind.INTENT_CREATED,
            providerEventId: `uddokta_${charge.invoiceId ?? intent.id}`,
            metadata: { provider: PaymentProvider.UDDOKTAPAY, checkoutUrl: charge.paymentUrl },
          },
        },
      },
    });
    return await this.toPublic(upgraded, order.orderNumber);
  }

  async gatewayPaymentForOrder(orderId: string): Promise<{ method: string | null; transactionId: string | null }> {
    const intents = await this.prisma.paymentIntent.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
      include: { events: { orderBy: { createdAt: "desc" }, take: 12 } },
    });
    const intent =
      intents.find((row) => row.provider === PaymentProvider.UDDOKTAPAY && row.status === PaymentIntentStatus.SUCCEEDED) ??
      intents.find((row) => row.provider === PaymentProvider.UDDOKTAPAY) ??
      intents.find((row) => row.status === PaymentIntentStatus.SUCCEEDED) ??
      null;
    if (!intent) return { method: null, transactionId: null };

    let rawMethod = intent.paymentMethod;
    let method = paymentMethodLabel(intent.paymentMethod);
    let transactionId = intent.transactionId;
    for (const event of intent.events) {
      const facts = readPaymentFacts(event.metadata);
      rawMethod = rawMethod ?? facts.paymentMethod;
      method = method ?? paymentMethodLabel(facts.paymentMethod);
      transactionId = transactionId ?? facts.transactionId;
    }
    if ((rawMethod || transactionId) && (!intent.paymentMethod || !intent.transactionId)) {
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: {
          ...(intent.paymentMethod || !rawMethod ? {} : { paymentMethod: rawMethod }),
          ...(intent.transactionId || !transactionId ? {} : { transactionId }),
        },
      });
    }
    if (method && transactionId) return { method, transactionId };

    const invoices = new Set<string>();
    const addInvoice = (value: string | null | undefined) => {
      const id = value?.trim();
      if (!id) return;
      if (id.includes("://")) {
        const fromUrl = invoiceIdFromPaymentUrl(id);
        if (fromUrl) invoices.add(fromUrl);
        return;
      }
      if (id.length >= 8 && id.length <= 80 && !isCheckoutSessionToken(id)) invoices.add(id);
    };
    addInvoice(intent.externalRef);
    for (const event of intent.events) {
      const meta = event.metadata;
      if (!meta || typeof meta !== "object") continue;
      const record = meta as Record<string, unknown>;
      if (typeof record.invoiceId === "string") addInvoice(record.invoiceId);
      if (typeof record.checkoutUrl === "string") addInvoice(invoiceIdFromPaymentUrl(record.checkoutUrl));
    }
    addInvoice(await this.invoiceFromEvents(intent.id));

    for (const invoiceId of invoices) {
      if (method && transactionId) break;
      try {
        await this.saveUddoktaFacts(intent.id, invoiceId);
        const fresh = await this.prisma.paymentIntent.findUnique({ where: { id: intent.id } });
        if (!fresh) break;
        method = method ?? paymentMethodLabel(fresh.paymentMethod);
        transactionId = transactionId ?? fresh.transactionId;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Uddokta payment facts unavailable for orderId=${orderId}: ${message}`);
      }
    }
    return { method, transactionId };
  }

  private async saveUddoktaFacts(paymentIntentId: string, invoiceId: string): Promise<void> {
    const gateway = await this.gateways.getRuntime();
    if (!gateway.enabled || !gateway.apiKey || !gateway.baseUrl) return;
    const verified = await this.uddoktapay.verify(gateway.baseUrl, gateway.apiKey, invoiceId);
    if (!verified.paymentMethod && !verified.transactionId) return;
    await this.prisma.paymentIntent.update({
      where: { id: paymentIntentId },
      data: {
        externalRef: invoiceId,
        ...(verified.paymentMethod ? { paymentMethod: verified.paymentMethod } : {}),
        ...(verified.transactionId ? { transactionId: verified.transactionId } : {}),
      },
    });
  }

  private async toPublic(
    intent: PaymentIntent,
    orderNumber: string,
  ): Promise<PublicPaymentIntent> {
    const createdEvents = await this.prisma.paymentEvent.findMany({
      where: { paymentIntentId: intent.id, kind: PaymentEventKind.INTENT_CREATED },
      orderBy: { createdAt: "desc" },
    });
    let checkoutUrl: string | null = null;
    for (const created of createdEvents) {
      const meta = created.metadata;
      if (
        meta &&
        typeof meta === "object" &&
        "checkoutUrl" in meta &&
        typeof meta.checkoutUrl === "string" &&
        meta.checkoutUrl
      ) {
        checkoutUrl = meta.checkoutUrl;
        break;
      }
    }
    const sandboxMode = intent.provider === PaymentProvider.SANDBOX;
    return {
      id: intent.id,
      orderId: intent.orderId,
      orderNumber,
      provider: intent.provider,
      status: intent.status as PublicPaymentIntent["status"],
      amountMinor: intent.amountMinor,
      currency: intent.currency,
      expiresAt: intent.expiresAt.toISOString(),
      sandboxMode,
      checkoutPath: `/checkout/pay/${intent.orderId}`,
      checkoutUrl: sandboxMode ? null : checkoutUrl,
      createdAt: intent.createdAt.toISOString(),
    };
  }
}

function isCheckoutSessionToken(value: string): boolean {
  return /^[a-f0-9]{32,}$/i.test(value.trim());
}

function orderIdFromUddokta(record: Record<string, unknown>): string | null {
  const direct = record.orderId ?? record.order_id;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  let metadata: unknown = record.metadata;
  if (typeof metadata === "string") {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      metadata = null;
    }
  }
  if (!metadata || typeof metadata !== "object") return null;
  const row = metadata as Record<string, unknown>;
  const id = row.orderId ?? row.order_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}
