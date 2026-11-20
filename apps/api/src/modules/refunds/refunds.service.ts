import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  AdminRefundAction,
  AdminRefundDetail,
  AdminRefundListItem,
  AdminPage,
  PublicRefundDetail,
  PublicRefundListItem,
} from "@amarpin/types";
import {
  OrderStatus,
  PaymentIntentStatus,
  RefundDestination,
  RefundStatus,
  WalletTransactionType,
  type Prisma,
  type Refund,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../shared/audit/audit.service";
import { computeRefundSummary, mapRefundListItem } from "../orders/orders.mapper";
import { FulfillmentService } from "../orders/fulfillment.service";
import { PointsService } from "../points/points.service";
import { WalletService } from "../wallet/wallet.service";
import { SandboxPaymentProvider } from "../payments/sandbox-payment.provider";
import {
  REFUND_PORT,
  type RefundPort,
} from "../payments/refund.port";
import type { AdminRefundActionDto } from "./dto/admin-refund-action.dto";
import type { AdminRefundListQuery } from "./dto/admin-refund-list.query";
import type { CreateRefundDto } from "./dto/create-refund.dto";

const OPEN: RefundStatus[] = [
  RefundStatus.REQUESTED,
  RefundStatus.APPROVED,
  RefundStatus.PROCESSING,
];

@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly wallet: WalletService,
    private readonly fulfillment: FulfillmentService,
    private readonly points: PointsService,
    private readonly config: ConfigService,
    @Inject(REFUND_PORT) private readonly refundPort: RefundPort,
  ) {}

  isSandboxAllowed(): boolean {
    return SandboxPaymentProvider.isSandboxRuntimeAllowed(this.config);
  }

  async listForUser(userId: string): Promise<PublicRefundListItem[]> {
    const rows = await this.prisma.refund.findMany({
      where: { userId },
      include: { order: { select: { orderNumber: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map((row) => mapRefundListItem(row, row.order.orderNumber));
  }

  async getForUser(userId: string, refundId: string): Promise<PublicRefundDetail> {
    const row = await this.prisma.refund.findUnique({
      where: { id: refundId },
      include: {
        order: { select: { orderNumber: true, userId: true } },
        history: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!row || row.userId !== userId) {
      throw new NotFoundException("Refund not found");
    }
    return this.toPublicDetail(row);
  }

  async requestForUser(
    userId: string,
    dto: CreateRefundDto,
  ): Promise<PublicRefundDetail> {
    const reason = dto.reason.trim();
    if (reason.length < 8) {
      throw new BadRequestException("Reason must be at least 8 characters");
    }

    const existing = await this.prisma.refund.findUnique({
      where: {
        orderId_idempotencyKey: {
          orderId: dto.orderId,
          idempotencyKey: dto.idempotencyKey.trim(),
        },
      },
      include: {
        order: { select: { orderNumber: true } },
        history: { orderBy: { createdAt: "asc" } },
      },
    });
    if (existing) {
      if (existing.userId !== userId) {
        throw new NotFoundException("Refund not found");
      }
      return this.toPublicDetail(existing);
    }

    const created = await this.prisma.$transaction(
      async (tx) => {
        const orderRows = await tx.$queryRaw<
          Array<{
            id: string;
            userId: string;
            status: OrderStatus;
            totalMinor: number;
            refundedMinor: number;
            orderNumber: string;
            currency: string;
          }>
        >`
          SELECT id, "userId", status, "totalMinor", "refundedMinor", "orderNumber", currency
          FROM orders
          WHERE id = ${dto.orderId}
          FOR UPDATE
        `;
        const order = orderRows[0];
        if (!order || order.userId !== userId) {
          throw new NotFoundException("Order not found");
        }
        this.assertOrderEligible(order.status);

        const openRefunds = await tx.refund.findMany({
          where: { orderId: order.id, status: { in: OPEN } },
        });
        const pendingMinor = openRefunds.reduce(
          (sum, row) => sum + row.amountMinor,
          0,
        );
        const refundable =
          order.totalMinor - order.refundedMinor - pendingMinor;
        if (dto.amountMinor > refundable) {
          throw new BadRequestException(
            `Amount exceeds refundable balance (${refundable})`,
          );
        }

        let paymentIntentId: string | null = dto.paymentIntentId ?? null;
        if (paymentIntentId) {
          const intent = await tx.paymentIntent.findFirst({
            where: {
              id: paymentIntentId,
              orderId: order.id,
              status: PaymentIntentStatus.SUCCEEDED,
            },
          });
          if (!intent) {
            throw new BadRequestException("Payment intent not found for order");
          }
        } else {
          const intent = await tx.paymentIntent.findFirst({
            where: {
              orderId: order.id,
              status: PaymentIntentStatus.SUCCEEDED,
            },
            orderBy: { succeededAt: "desc" },
          });
          paymentIntentId = intent?.id ?? null;
        }

        try {
          const refund = await tx.refund.create({
            data: {
              orderId: order.id,
              paymentIntentId,
              userId,
              amountMinor: dto.amountMinor,
              currency: order.currency,
              status: RefundStatus.REQUESTED,
              destination: RefundDestination.ORIGINAL_PROVIDER,
              reason,
              idempotencyKey: dto.idempotencyKey.trim(),
              requestedByUserId: userId,
              history: {
                create: {
                  fromStatus: null,
                  toStatus: RefundStatus.REQUESTED,
                  actorUserId: userId,
                  reason,
                },
              },
            },
            include: {
              order: { select: { orderNumber: true } },
              history: { orderBy: { createdAt: "asc" } },
            },
          });
          return refund;
        } catch (error) {
          if (
            error instanceof Error &&
            "code" in error &&
            (error as { code?: string }).code === "P2002"
          ) {
            const raced = await tx.refund.findUnique({
              where: {
                orderId_idempotencyKey: {
                  orderId: dto.orderId,
                  idempotencyKey: dto.idempotencyKey.trim(),
                },
              },
              include: {
                order: { select: { orderNumber: true } },
                history: { orderBy: { createdAt: "asc" } },
              },
            });
            if (raced && raced.userId === userId) return raced;
          }
          throw error;
        }
      },
      { isolationLevel: "Serializable", timeout: 15_000 },
    );

    await this.audit.record({
      action: "refund.requested",
      userId,
      entityType: "refund",
      entityId: created.id,
      metadata: {
        orderId: created.orderId,
        amountMinor: created.amountMinor,
      },
    });

    return this.toPublicDetail(created);
  }

  async adminList(
    query: AdminRefundListQuery,
  ): Promise<AdminPage<AdminRefundListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.RefundWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.orderId) where.orderId = query.orderId;
    if (query.customerId) where.userId = query.customerId;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { id: { equals: q } },
        { order: { orderNumber: { contains: q, mode: "insensitive" } } },
        { user: { email: { contains: q, mode: "insensitive" } } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.refund.count({ where }),
      this.prisma.refund.findMany({
        where,
        include: {
          order: { select: { orderNumber: true } },
          user: { select: { id: true, email: true } },
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
      items: rows.map((row) => this.toAdminListItem(row)),
    };
  }

  async adminGet(refundId: string): Promise<AdminRefundDetail> {
    const row = await this.prisma.refund.findUnique({
      where: { id: refundId },
      include: {
        order: { select: { orderNumber: true } },
        user: { select: { id: true, email: true } },
        history: { orderBy: { createdAt: "asc" } },
        paymentIntent: true,
      },
    });
    if (!row) throw new NotFoundException("Refund not found");
    const base = this.toAdminListItem(row);
    return {
      ...base,
      history: row.history.map((item) => ({
        id: item.id,
        fromStatus: item.fromStatus,
        toStatus: item.toStatus,
        reason: item.reason,
        createdAt: item.createdAt.toISOString(),
      })),
      payment: row.paymentIntent
        ? {
            id: row.paymentIntent.id,
            provider: row.paymentIntent.provider,
            status: row.paymentIntent.status,
            externalRef: row.paymentIntent.externalRef,
            amountMinor: row.paymentIntent.amountMinor,
          }
        : null,
    };
  }

  async adminAction(
    actorUserId: string,
    refundId: string,
    dto: AdminRefundActionDto,
  ): Promise<AdminRefundDetail> {
    const reason = dto.reason.trim();
    if (reason.length < 8) {
      throw new BadRequestException("Reason is required (min 8 chars)");
    }

    switch (dto.action) {
      case "APPROVE":
        await this.transition(actorUserId, refundId, {
          from: [RefundStatus.REQUESTED],
          to: RefundStatus.APPROVED,
          reason,
          destination: dto.destination,
          auditAction: "admin.refund.approve",
        });
        break;
      case "REJECT":
        await this.transition(actorUserId, refundId, {
          from: [RefundStatus.REQUESTED, RefundStatus.APPROVED],
          to: RefundStatus.REJECTED,
          reason,
          auditAction: "admin.refund.reject",
        });
        break;
      case "MARK_PROCESSING":
        await this.beginProcessing(actorUserId, refundId, reason, dto.destination);
        break;
      case "RECORD_RESULT":
        if (!dto.result) {
          throw new BadRequestException("result is required for RECORD_RESULT");
        }
        await this.recordResult(actorUserId, refundId, {
          reason,
          result: dto.result,
          destination: dto.destination,
          providerRef: dto.providerRef,
        });
        break;
      default:
        throw new BadRequestException("Unknown refund action");
    }

    return this.adminGet(refundId);
  }

  /**
   * Development-only: simulate external provider refund callback.
   * Does not auto-complete without admin RECORD_RESULT unless outcome applied via recordResult path.
   */
  async sandboxSimulate(
    actorUserId: string,
    refundId: string,
    outcome: "success" | "failure",
    reason: string,
  ): Promise<AdminRefundDetail> {
    if (!this.isSandboxAllowed()) {
      throw new ForbiddenException("Sandbox refunds are disabled");
    }
    if (!this.refundPort.simulateRefundResult) {
      throw new BadRequestException("Sandbox simulation unavailable");
    }

    const refund = await this.prisma.refund.findUnique({
      where: { id: refundId },
      include: { paymentIntent: true },
    });
    if (!refund) throw new NotFoundException("Refund not found");
    if (refund.status !== RefundStatus.PROCESSING) {
      throw new BadRequestException("Refund must be PROCESSING to simulate");
    }
    const externalRef =
      refund.providerRef ||
      refund.paymentIntent?.externalRef ||
      `refund_${refund.id}`;
    await this.refundPort.simulateRefundResult(externalRef, outcome);

    await this.recordResult(actorUserId, refundId, {
      reason: reason.trim() || `Sandbox simulated ${outcome}`,
      result: outcome,
      providerRef: externalRef,
      destination: refund.destination,
      source: "sandbox_simulate",
    });

    return this.adminGet(refundId);
  }

  private async beginProcessing(
    actorUserId: string,
    refundId: string,
    reason: string,
    destination?: "ORIGINAL_PROVIDER" | "WALLET",
  ): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const refund = await this.lockRefund(tx, refundId);
        if (
          refund.status !== RefundStatus.APPROVED &&
          refund.status !== RefundStatus.REQUESTED
        ) {
          throw new BadRequestException(
            `Cannot mark processing from status ${refund.status}`,
          );
        }
        const nextDestination = destination
          ? (destination as RefundDestination)
          : refund.destination;

        await tx.refund.update({
          where: { id: refundId },
          data: {
            status: RefundStatus.PROCESSING,
            destination: nextDestination,
            processedByUserId: actorUserId,
          },
        });
        await tx.refundStatusHistory.create({
          data: {
            refundId,
            fromStatus: refund.status,
            toStatus: RefundStatus.PROCESSING,
            actorUserId,
            reason,
            metadata: { destination: nextDestination },
          },
        });
      },
      { isolationLevel: "Serializable", timeout: 15_000 },
    );

    // Provider initiate — never auto-settle here.
    const refund = await this.prisma.refund.findUniqueOrThrow({
      where: { id: refundId },
      include: { paymentIntent: true },
    });
    if (
      refund.destination === RefundDestination.ORIGINAL_PROVIDER &&
      refund.paymentIntent?.externalRef &&
      this.isSandboxAllowed()
    ) {
      try {
        const result = await this.refundPort.initiateRefund({
          externalRef: refund.paymentIntent.externalRef,
          amountMinor: refund.amountMinor,
          currency: refund.currency,
          refundId: refund.id,
        });
        await this.prisma.refund.update({
          where: { id: refundId },
          data: { providerRef: result.providerEventId },
        });
        // Even if sandbox somehow returned succeeded, we do NOT auto-complete —
        // admin must RECORD_RESULT (except explicit sandbox simulate endpoint).
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Provider initiateRefund pending/failed: ${message}`);
      }
    }

    await this.audit.record({
      action: "admin.refund.processing",
      userId: actorUserId,
      entityType: "refund",
      entityId: refundId,
      metadata: { reason },
    });
  }

  private async recordResult(
    actorUserId: string,
    refundId: string,
    input: {
      reason: string;
      result: "success" | "failure";
      destination?: "ORIGINAL_PROVIDER" | "WALLET";
      providerRef?: string;
      source?: string;
    },
  ): Promise<void> {
    const toStatus =
      input.result === "success"
        ? RefundStatus.SUCCEEDED
        : RefundStatus.FAILED;

    let walletCreditUserId: string | null = null;
    let walletAmount = 0;
    let walletCurrency = "BDT";
    let walletIdempotency = "";
    let pointsOrderId: string | null = null;

    await this.prisma.$transaction(
      async (tx) => {
        const refund = await this.lockRefund(tx, refundId);
        if (refund.status === RefundStatus.SUCCEEDED) {
          return; // idempotent
        }
        if (refund.status !== RefundStatus.PROCESSING) {
          throw new BadRequestException(
            `Cannot record result from status ${refund.status}`,
          );
        }

        const destination = input.destination
          ? (input.destination as RefundDestination)
          : refund.destination;

        if (
          toStatus === RefundStatus.SUCCEEDED &&
          destination === RefundDestination.WALLET
        ) {
          // Explicit wallet destination only — never implicit for provider payments.
          walletCreditUserId = refund.userId;
          walletAmount = refund.amountMinor;
          walletCurrency = refund.currency;
          walletIdempotency = `refund-wallet:${refund.id}`;
        }

        await tx.refund.update({
          where: { id: refundId },
          data: {
            status: toStatus,
            destination,
            processedByUserId: actorUserId,
            providerRef: input.providerRef?.trim() || refund.providerRef,
          },
        });
        await tx.refundStatusHistory.create({
          data: {
            refundId,
            fromStatus: refund.status,
            toStatus,
            actorUserId,
            reason: input.reason,
            metadata: {
              result: input.result,
              destination,
              source: input.source ?? "admin_record",
              providerRef: input.providerRef ?? null,
            },
          },
        });

        if (toStatus === RefundStatus.SUCCEEDED) {
          await this.applySucceededRefundToOrder(tx, refund);
          pointsOrderId = refund.orderId;
        }
      },
      { isolationLevel: "Serializable", timeout: 15_000 },
    );

    if (walletCreditUserId) {
      await this.wallet.postLedgerEntry({
        userId: walletCreditUserId,
        type: WalletTransactionType.CREDIT,
        amountMinor: walletAmount,
        currency: walletCurrency,
        idempotencyKey: walletIdempotency,
        referenceType: "refund",
        referenceId: refundId,
        description: `Refund ${refundId}`,
        auditAction: "refund.wallet_credit",
        actorUserId,
      });
    }

    if (pointsOrderId) await this.points.syncOrder(pointsOrderId);

    await this.audit.record({
      action:
        toStatus === RefundStatus.SUCCEEDED
          ? "admin.refund.succeeded"
          : "admin.refund.failed",
      userId: actorUserId,
      entityType: "refund",
      entityId: refundId,
      metadata: {
        reason: input.reason,
        result: input.result,
        destination: input.destination ?? null,
        source: input.source ?? "admin_record",
      },
    });
  }

  private async applySucceededRefundToOrder(
    tx: Prisma.TransactionClient,
    refund: Refund,
  ): Promise<void> {
    const orderRows = await tx.$queryRaw<
      Array<{
        id: string;
        status: OrderStatus;
        totalMinor: number;
        refundedMinor: number;
      }>
    >`
      SELECT id, status, "totalMinor", "refundedMinor"
      FROM orders
      WHERE id = ${refund.orderId}
      FOR UPDATE
    `;
    const order = orderRows[0];
    if (!order) throw new NotFoundException("Order not found");

    const nextRefunded = order.refundedMinor + refund.amountMinor;
    if (nextRefunded > order.totalMinor) {
      throw new BadRequestException("Refund would over-refund order");
    }

    const openOthers = await tx.refund.count({
      where: {
        orderId: order.id,
        id: { not: refund.id },
        status: { in: OPEN },
      },
    });

    let nextStatus = order.status;
    if (nextRefunded >= order.totalMinor && openOthers === 0) {
      nextStatus = OrderStatus.REFUNDED;
    } else if (nextRefunded > 0) {
      nextStatus = OrderStatus.PARTIALLY_REFUNDED;
    }

    // Never mark fully refunded while other refunds are still open.
    if (nextRefunded >= order.totalMinor && openOthers > 0) {
      nextStatus = OrderStatus.PARTIALLY_REFUNDED;
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        refundedMinor: nextRefunded,
        status: nextStatus,
      },
    });

    if (nextStatus !== order.status) {
      await this.fulfillment.recordStatus(tx, {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: nextStatus,
        reason: `refund.succeeded:${refund.id}`,
      });
    }
  }

  private async transition(
    actorUserId: string,
    refundId: string,
    input: {
      from: RefundStatus[];
      to: RefundStatus;
      reason: string;
      destination?: "ORIGINAL_PROVIDER" | "WALLET";
      auditAction: string;
    },
  ): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const refund = await this.lockRefund(tx, refundId);
        if (!input.from.includes(refund.status)) {
          throw new BadRequestException(
            `Cannot transition from ${refund.status} to ${input.to}`,
          );
        }
        await tx.refund.update({
          where: { id: refundId },
          data: {
            status: input.to,
            processedByUserId: actorUserId,
            ...(input.destination
              ? { destination: input.destination as RefundDestination }
              : {}),
          },
        });
        await tx.refundStatusHistory.create({
          data: {
            refundId,
            fromStatus: refund.status,
            toStatus: input.to,
            actorUserId,
            reason: input.reason,
            metadata: input.destination
              ? { destination: input.destination }
              : undefined,
          },
        });
      },
      { isolationLevel: "Serializable", timeout: 15_000 },
    );

    await this.audit.record({
      action: input.auditAction,
      userId: actorUserId,
      entityType: "refund",
      entityId: refundId,
      metadata: { reason: input.reason, to: input.to },
    });
  }

  private async lockRefund(tx: Prisma.TransactionClient, refundId: string) {
    const rows = await tx.$queryRaw<Refund[]>`
      SELECT *
      FROM refunds
      WHERE id = ${refundId}
      FOR UPDATE
    `;
    const refund = rows[0];
    if (!refund) throw new NotFoundException("Refund not found");
    return refund;
  }

  private assertOrderEligible(status: OrderStatus): void {
    const ok: OrderStatus[] = [
      OrderStatus.PAID,
      OrderStatus.FULFILLED,
      OrderStatus.PARTIALLY_REFUNDED,
    ];
    if (!ok.includes(status)) {
      throw new BadRequestException(
        "Order is not eligible for refund in its current status",
      );
    }
  }

  private allowedActions(status: RefundStatus): AdminRefundAction[] {
    switch (status) {
      case RefundStatus.REQUESTED:
        return ["APPROVE", "REJECT", "MARK_PROCESSING"];
      case RefundStatus.APPROVED:
        return ["REJECT", "MARK_PROCESSING"];
      case RefundStatus.PROCESSING:
        return ["RECORD_RESULT"];
      default:
        return [];
    }
  }

  private toAdminListItem(row: {
    id: string;
    orderId: string;
    amountMinor: number;
    currency: string;
    status: RefundStatus;
    destination: RefundDestination;
    reason: string;
    createdAt: Date;
    updatedAt: Date;
    paymentIntentId: string | null;
    providerRef: string | null;
    order: { orderNumber: string };
    user: { id: string; email: string };
  }): AdminRefundListItem {
    return {
      ...mapRefundListItem(row, row.order.orderNumber),
      customerEmail: row.user.email,
      customerId: row.user.id,
      paymentIntentId: row.paymentIntentId,
      providerRef: row.providerRef,
      allowedActions: this.allowedActions(row.status),
    };
  }

  private toPublicDetail(row: {
    id: string;
    orderId: string;
    amountMinor: number;
    currency: string;
    status: RefundStatus;
    destination: RefundDestination;
    reason: string;
    createdAt: Date;
    updatedAt: Date;
    paymentIntentId: string | null;
    providerRef: string | null;
    order: { orderNumber: string };
    history: Array<{
      id: string;
      fromStatus: RefundStatus | null;
      toStatus: RefundStatus;
      reason: string | null;
      createdAt: Date;
    }>;
  }): PublicRefundDetail {
    return {
      ...mapRefundListItem(row, row.order.orderNumber),
      paymentIntentId: row.paymentIntentId,
      providerRef: row.providerRef,
      history: row.history.map((item) => ({
        id: item.id,
        fromStatus: item.fromStatus,
        toStatus: item.toStatus,
        reason: item.reason,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }
}

/** Re-export helper for admin payment views. */
export { computeRefundSummary };
