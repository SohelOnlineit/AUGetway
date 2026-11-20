import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AdminCoupon, AdminPage, CouponQuote } from "@amarpin/types";
import {
  CouponDiscountType,
  CouponRedemptionStatus,
  type Prisma,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../shared/audit/audit.service";
import { computeDiscountMinor } from "./discount";
import type { UpsertCouponDto } from "./dto/coupon.dto";
import { AdminPaginationQuery } from "../admin/dto/admin-common.dto";

export type CheckoutLine = {
  productId: string;
  categoryId: string;
  lineTotalMinor: number;
  currency: string;
};

const COUNTABLE = [
  CouponRedemptionStatus.HELD,
  CouponRedemptionStatus.CONSUMED,
];

@Injectable()
export class CouponsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async quoteForUser(
    userId: string,
    code: string,
    lines: CheckoutLine[],
  ): Promise<CouponQuote> {
    return this.prisma.$transaction(async (tx) => {
      const quote = await this.quoteLocked(tx, userId, code, lines);
      return {
        code: quote.code,
        discountMinor: quote.discountMinor,
        currency: lines[0]?.currency ?? "BDT",
        eligibleSubtotalMinor: quote.eligibleSubtotalMinor,
      };
    });
  }

  /**
   * Row-lock the coupon and validate limits. Caller must create the order
   * and call recordHold in the same transaction.
   */
  async quoteLocked(
    tx: Prisma.TransactionClient,
    userId: string,
    rawCode: string,
    lines: CheckoutLine[],
  ) {
    const code = rawCode.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code)) {
      throw new BadRequestException("Invalid coupon code");
    }

    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "coupons" WHERE "code" = ${code} FOR UPDATE
    `;
    const couponId = locked[0]?.id;
    if (!couponId) throw new BadRequestException("Coupon is not valid");

    const coupon = await tx.coupon.findUnique({
      where: { id: couponId },
      include: {
        products: { select: { productId: true } },
        categories: { select: { categoryId: true } },
      },
    });
    if (!coupon || !coupon.isActive) {
      throw new BadRequestException("Coupon is not valid");
    }

    const now = Date.now();
    if (coupon.startsAt && coupon.startsAt.getTime() > now) {
      throw new BadRequestException("Coupon is not valid yet");
    }
    if (coupon.endsAt && coupon.endsAt.getTime() < now) {
      throw new BadRequestException("Coupon has expired");
    }

    const currency = lines[0]?.currency ?? "BDT";
    if (lines.some((line) => line.currency !== currency)) {
      throw new BadRequestException("Mixed currencies are not supported");
    }
    if (coupon.discountType === CouponDiscountType.FIXED && coupon.currency !== currency) {
      throw new BadRequestException("Coupon currency does not match the cart");
    }

    const subtotal = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
    if (subtotal < coupon.minSubtotalMinor) {
      throw new BadRequestException("Order does not meet the coupon minimum");
    }

    const productIds = new Set(coupon.products.map((row) => row.productId));
    const categoryIds = new Set(coupon.categories.map((row) => row.categoryId));
    const restricted = productIds.size > 0 || categoryIds.size > 0;
    const eligibleLines = restricted
      ? lines.filter(
          (line) =>
            productIds.has(line.productId) || categoryIds.has(line.categoryId),
        )
      : lines;
    const eligibleSubtotalMinor = eligibleLines.reduce(
      (sum, line) => sum + line.lineTotalMinor,
      0,
    );
    if (eligibleSubtotalMinor <= 0) {
      throw new BadRequestException("Coupon does not apply to these items");
    }

    const [globalUsed, customerUsed] = await Promise.all([
      tx.couponRedemption.count({
        where: { couponId: coupon.id, status: { in: COUNTABLE } },
      }),
      tx.couponRedemption.count({
        where: { couponId: coupon.id, userId, status: { in: COUNTABLE } },
      }),
    ]);
    if (
      coupon.maxRedemptions != null &&
      globalUsed >= coupon.maxRedemptions
    ) {
      throw new BadRequestException("Coupon usage limit reached");
    }
    if (
      coupon.maxPerCustomer != null &&
      customerUsed >= coupon.maxPerCustomer
    ) {
      throw new BadRequestException("You have already used this coupon");
    }

    const discountMinor = computeDiscountMinor({
      discountType: coupon.discountType,
      percent: coupon.percent,
      amountMinor: coupon.amountMinor,
      eligibleSubtotalMinor,
    });
    if (discountMinor <= 0) {
      throw new BadRequestException("Coupon does not reduce this order");
    }

    return {
      couponId: coupon.id,
      code: coupon.code,
      discountMinor,
      eligibleSubtotalMinor,
    };
  }

  async recordHold(
    tx: Prisma.TransactionClient,
    input: {
      couponId: string;
      orderId: string;
      userId: string;
      discountMinor: number;
      idempotencyKey: string;
    },
  ) {
    await tx.couponRedemption.create({
      data: {
        couponId: input.couponId,
        orderId: input.orderId,
        userId: input.userId,
        discountMinor: input.discountMinor,
        idempotencyKey: input.idempotencyKey,
        status: CouponRedemptionStatus.HELD,
      },
    });
  }

  /** Pending order cancelled or reservation expired — return the hold. */
  async releaseHeld(tx: Prisma.TransactionClient, orderId: string) {
    await tx.couponRedemption.updateMany({
      where: { orderId, status: CouponRedemptionStatus.HELD },
      data: { status: CouponRedemptionStatus.RELEASED },
    });
  }

  /** Payment settled — hold becomes a consumed redemption. */
  async consumeHeld(tx: Prisma.TransactionClient, orderId: string) {
    await tx.couponRedemption.updateMany({
      where: { orderId, status: CouponRedemptionStatus.HELD },
      data: { status: CouponRedemptionStatus.CONSUMED },
    });
  }

  async adminList(query: AdminPaginationQuery): Promise<AdminPage<AdminCoupon>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.CouponWhereInput = {};
    if (query.q?.trim()) {
      where.code = { contains: query.q.trim().toUpperCase(), mode: "insensitive" };
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.coupon.count({ where }),
      this.prisma.coupon.findMany({
        where,
        include: {
          products: { select: { productId: true } },
          categories: { select: { categoryId: true } },
          _count: {
            select: {
              redemptions: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const items = await Promise.all(rows.map((row) => this.mapAdmin(row)));
    return { items, total, page, pageSize };
  }

  async adminCreate(actorUserId: string, dto: UpsertCouponDto) {
    const data = this.normalize(dto);
    try {
      const row = await this.prisma.coupon.create({
        data: {
          ...data,
          products: {
            create: (dto.productIds ?? []).map((productId) => ({ productId })),
          },
          categories: {
            create: (dto.categoryIds ?? []).map((categoryId) => ({ categoryId })),
          },
        },
        include: this.include(),
      });
      await this.audit.record({
        action: "admin.coupon.created",
        userId: actorUserId,
        entityType: "coupon",
        entityId: row.id,
        metadata: { code: row.code },
      });
      return this.mapAdmin(row);
    } catch (error) {
      this.rethrowUnique(error);
      throw error;
    }
  }

  async adminUpdate(actorUserId: string, id: string, dto: UpsertCouponDto) {
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Coupon not found");
    const data = this.normalize(dto);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await tx.couponProduct.deleteMany({ where: { couponId: id } });
        await tx.couponCategory.deleteMany({ where: { couponId: id } });
        return tx.coupon.update({
          where: { id },
          data: {
            ...data,
            products: {
              create: (dto.productIds ?? []).map((productId) => ({ productId })),
            },
            categories: {
              create: (dto.categoryIds ?? []).map((categoryId) => ({
                categoryId,
              })),
            },
          },
          include: this.include(),
        });
      });
      await this.audit.record({
        action: "admin.coupon.updated",
        userId: actorUserId,
        entityType: "coupon",
        entityId: id,
        metadata: { code: row.code, isActive: row.isActive },
      });
      return this.mapAdmin(row);
    } catch (error) {
      this.rethrowUnique(error);
      throw error;
    }
  }

  private normalize(dto: UpsertCouponDto) {
    const code = dto.code.trim().toUpperCase();
    if (dto.discountType === "PERCENT") {
      if (!dto.percent || dto.percent < 1 || dto.percent > 100) {
        throw new BadRequestException("percent must be 1–100");
      }
    } else if (!dto.amountMinor || dto.amountMinor < 1) {
      throw new BadRequestException("amountMinor is required for FIXED coupons");
    }
    return {
      code,
      discountType: dto.discountType as CouponDiscountType,
      percent: dto.discountType === "PERCENT" ? dto.percent! : null,
      amountMinor: dto.discountType === "FIXED" ? dto.amountMinor! : null,
      currency: (dto.currency ?? "BDT").trim().toUpperCase(),
      isActive: dto.isActive ?? false,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      maxRedemptions: dto.maxRedemptions ?? null,
      maxPerCustomer: dto.maxPerCustomer ?? null,
      minSubtotalMinor: dto.minSubtotalMinor ?? 0,
    };
  }

  private include() {
    return {
      products: { select: { productId: true } },
      categories: { select: { categoryId: true } },
    } satisfies Prisma.CouponInclude;
  }

  private async mapAdmin(row: {
    id: string;
    code: string;
    discountType: CouponDiscountType;
    percent: number | null;
    amountMinor: number | null;
    currency: string;
    isActive: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
    maxRedemptions: number | null;
    maxPerCustomer: number | null;
    minSubtotalMinor: number;
    createdAt: Date;
    updatedAt: Date;
    products: Array<{ productId: string }>;
    categories: Array<{ categoryId: string }>;
  }): Promise<AdminCoupon> {
    const [heldCount, consumedCount] = await Promise.all([
      this.prisma.couponRedemption.count({
        where: { couponId: row.id, status: CouponRedemptionStatus.HELD },
      }),
      this.prisma.couponRedemption.count({
        where: { couponId: row.id, status: CouponRedemptionStatus.CONSUMED },
      }),
    ]);
    return {
      id: row.id,
      code: row.code,
      discountType: row.discountType,
      percent: row.percent,
      amountMinor: row.amountMinor,
      currency: row.currency,
      isActive: row.isActive,
      startsAt: row.startsAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
      maxRedemptions: row.maxRedemptions,
      maxPerCustomer: row.maxPerCustomer,
      minSubtotalMinor: row.minSubtotalMinor,
      productIds: row.products.map((item) => item.productId),
      categoryIds: row.categories.map((item) => item.categoryId),
      heldCount,
      consumedCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private rethrowUnique(error: unknown): void {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      throw new ConflictException("Coupon code already exists");
    }
  }
}
