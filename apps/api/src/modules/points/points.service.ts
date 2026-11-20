import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { OrderStatus, Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { MAX_POINTS, pointsAfterDiscount, pointsAfterRefund, pointsForLine, pointsValueMinor } from "./points.math";

const SETTINGS_KEY = "points.settings";

function productImageUrl(images: Array<{ url: string; storefront: string; sortOrder: number }>): string | null {
  const sorted = [...images].sort((a, b) => a.sortOrder - b.sortOrder);
  const own = sorted.find((image) => (image.storefront || "amarpin") === "amarpin");
  const url = (own ?? sorted[0])?.url?.trim() ?? "";
  if (url.startsWith("/") || url.startsWith("https://") || url.startsWith("http://")) return url;
  return null;
}

const EARN_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.FULFILLED,
  OrderStatus.PARTIALLY_REFUNDED,
];

export type PointProductRule = {
  id: string;
  title: string;
  imageUrl: string | null;
  spendTaka: number;
  points: number;
};

export type PointLeader = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  points: number;
};

@Injectable()
export class PointsService {
  private readonly logger = new Logger(PointsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async isEnabled(): Promise<boolean> {
    const settings = await this.readSettings();
    return settings.enabled;
  }

  async balanceFor(userId: string): Promise<number> {
    const account = await this.balancesFor(userId);
    return account.points;
  }

  async balancesFor(userId: string): Promise<{ points: number; valueMinor: number }> {
    const account = await this.prisma.pointAccount.findUnique({
      where: { userId },
      select: { balance: true, valueMinor: true },
    });
    return { points: account?.balance ?? 0, valueMinor: account?.valueMinor ?? 0 };
  }

  async adminState(): Promise<{ enabled: boolean; products: PointProductRule[]; leaders: PointLeader[] }> {
    const [settings, products, leaders] = await Promise.all([
      this.readSettings(),
      this.prisma.product.findMany({
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
        select: {
          id: true,
          title: true,
          pointSpendMinor: true,
          pointReward: true,
          images: {
            orderBy: { sortOrder: "asc" },
            take: 6,
            select: { url: true, storefront: true, sortOrder: true },
          },
        },
      }),
      this.prisma.pointAccount.findMany({
        where: { balance: { gt: 0 }, user: { isGuest: false } },
        orderBy: [{ balance: "desc" }, { updatedAt: "asc" }],
        take: 10,
        select: {
          balance: true,
          user: { select: { id: true, displayName: true, email: true, avatarPath: true } },
        },
      }),
    ]);
    return {
      enabled: settings.enabled,
      products: products.map((product) => ({
        id: product.id,
        title: product.title,
        imageUrl: productImageUrl(product.images),
        spendTaka: product.pointSpendMinor / 100,
        points: product.pointReward,
      })),
      leaders: leaders.map((row) => ({
        userId: row.user.id,
        name: row.user.displayName?.trim() || row.user.email,
        avatarUrl: row.user.avatarPath,
        points: row.balance,
      })),
    };
  }

  async saveAdmin(body: unknown): Promise<{ enabled: boolean; products: PointProductRule[]; leaders: PointLeader[] }> {
    if (!body || typeof body !== "object") throw new BadRequestException("Invalid points settings");
    const raw = body as { enabled?: unknown; products?: unknown };
    const rules = this.parseProductRules(raw.products);
    await this.prisma.$transaction(async (tx) => {
      if (typeof raw.enabled === "boolean") {
        await tx.systemMeta.upsert({
          where: { key: SETTINGS_KEY },
          create: { key: SETTINGS_KEY, value: JSON.stringify({ enabled: raw.enabled }) },
          update: { value: JSON.stringify({ enabled: raw.enabled }) },
        });
      }
      for (const rule of rules) {
        const updated = await tx.product.updateMany({
          where: { id: rule.productId },
          data: { pointSpendMinor: rule.spendMinor, pointReward: rule.points },
        });
        if (updated.count !== 1) throw new BadRequestException("Product not found");
      }
    });
    return this.adminState();
  }

  private parseProductRules(products: unknown): Array<{ productId: string; spendMinor: number; points: number }> {
    if (products === undefined) return [];
    if (!Array.isArray(products)) throw new BadRequestException("Invalid product points");
    if (products.length > 500) throw new BadRequestException("Too many products");
    const seen = new Set<string>();
    return products.map((row) => {
      if (!row || typeof row !== "object") throw new BadRequestException("Invalid product points");
      const item = row as { productId?: unknown; spendTaka?: unknown; points?: unknown };
      if (typeof item.productId !== "string" || !item.productId || item.productId.length > 64) {
        throw new BadRequestException("Invalid product points");
      }
      if (seen.has(item.productId)) throw new BadRequestException("Duplicate product");
      seen.add(item.productId);
      const points = Number(item.points);
      if (!Number.isInteger(points) || points < 0 || points > 1_000_000) {
        throw new BadRequestException("Points must be a whole number");
      }
      return { productId: item.productId, spendMinor: this.takaToMinor(item.spendTaka), points };
    });
  }

  /** Two decimal places, stored as poisha, without binary-float rounding. */
  private takaToMinor(value: unknown): number {
    const spendTaka = Number(value);
    if (!Number.isFinite(spendTaka) || spendTaka < 0 || spendTaka > 1_000_000) {
      throw new BadRequestException("Spend amount is not valid");
    }
    const minor = Math.round(spendTaka * 100 + Number.EPSILON);
    if (Math.abs(minor / 100 - spendTaka) > 0.001) {
      throw new BadRequestException("Spend amount is not valid");
    }
    return minor;
  }

  /** Award or reverse points for an order. Never throws into checkout. */
  async syncOrder(orderId: string): Promise<void> {
    try {
      await this.syncOrderInner(orderId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      this.logger.warn(`points sync failed for ${orderId}: ${message}`);
    }
  }

  private async syncOrderInner(orderId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE
      `;
      if (!locked[0]) return;

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          user: { select: { isGuest: true } },
          items: {
            select: {
              lineTotalMinor: true,
              product: { select: { pointSpendMinor: true, pointReward: true } },
            },
          },
        },
      });
      if (!order || order.user.isGuest) return;

      const earnKey = `points:earn:${order.id}`;
      const earned = await tx.pointEntry.findUnique({ where: { idempotencyKey: earnKey } });
      const enabled = await this.readSettings(tx);
      let accountId: string | null = null;
      let balance = 0;
      let valueMinor = 0;

      if (!earned && enabled && EARN_STATUSES.includes(order.status)) {
        let listedPoints = 0;
        for (const item of order.items) {
          listedPoints += pointsForLine(item.lineTotalMinor, item.product.pointSpendMinor, item.product.pointReward);
          if (listedPoints > MAX_POINTS) listedPoints = MAX_POINTS;
        }
        const points = pointsAfterDiscount(listedPoints, order.subtotalMinor, order.totalMinor);
        const earnedValue = pointsValueMinor(points);
        if (points > 0) {
          const lockedAccount = await this.lockAccount(tx, order.userId);
          accountId = lockedAccount.id;
          balance = lockedAccount.balance;
          valueMinor = lockedAccount.valueMinor;
          const next = await this.apply(tx, balance, valueMinor, {
            accountId,
            userId: order.userId,
            orderId: order.id,
            points,
            valueMinor: earnedValue,
            idempotencyKey: earnKey,
            description: `Points for order ${order.orderNumber}`,
          });
          balance = next.balance;
          valueMinor = next.valueMinor;
        }
      }

      const earnRow = earned ?? (await tx.pointEntry.findUnique({ where: { idempotencyKey: earnKey } }));
      if (!earnRow || earnRow.points <= 0) return;

      let target = earnRow.points;
      if (order.status === OrderStatus.REFUNDED || order.status === OrderStatus.CANCELLED) {
        target = 0;
      } else if (order.status === OrderStatus.PARTIALLY_REFUNDED) {
        target = pointsAfterRefund(earnRow.points, order.totalMinor, order.refundedMinor);
      } else if (!EARN_STATUSES.includes(order.status)) {
        target = 0;
      }
      const targetValue = pointsValueMinor(target);

      const posted = await tx.pointEntry.aggregate({
        where: { orderId: order.id },
        _sum: { points: true, valueMinor: true },
      });
      const net = posted._sum.points ?? 0;
      const netValue = posted._sum.valueMinor ?? 0;
      const delta = target - net;
      const valueDelta = targetValue - netValue;
      if (delta === 0 && valueDelta === 0) return;
      if (!accountId) {
        const lockedAccount = await this.lockAccount(tx, order.userId);
        accountId = lockedAccount.id;
        balance = lockedAccount.balance;
        valueMinor = lockedAccount.valueMinor;
      }
      await this.apply(tx, balance, valueMinor, {
        accountId,
        userId: order.userId,
        orderId: order.id,
        points: delta,
        valueMinor: valueDelta,
        idempotencyKey: `points:adjust:${order.id}:${order.status}:${order.refundedMinor}:${net}:${netValue}`,
        description:
          delta < 0 || valueDelta < 0
            ? `Points reversed for order ${order.orderNumber}`
            : `Points for order ${order.orderNumber}`,
      });
    });
  }

  /** Lock the customer's balance so two orders cannot overwrite each other. */
  private async lockAccount(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<{ id: string; balance: number; valueMinor: number }> {
    const account = await tx.pointAccount.upsert({
      where: { userId },
      create: { userId, balance: 0 },
      update: {},
    });
    const rows = await tx.$queryRaw<Array<{ balance: number; valueMinor: number }>>`
      SELECT balance, "valueMinor" FROM point_accounts WHERE id = ${account.id} FOR UPDATE
    `;
    const raw = rows[0]?.balance ?? account.balance;
    const rawValue = rows[0]?.valueMinor ?? account.valueMinor;
    const balance = typeof raw === "number" ? raw : Number(raw);
    const valueMinor = typeof rawValue === "number" ? rawValue : Number(rawValue);
    return {
      id: account.id,
      balance: Number.isFinite(balance) ? balance : 0,
      valueMinor: Number.isFinite(valueMinor) ? valueMinor : 0,
    };
  }

  /** Write one ledger row. The account row must already be locked in this transaction. */
  private async apply(
    tx: Prisma.TransactionClient,
    balance: number,
    valueMinor: number,
    input: {
      accountId: string;
      userId: string;
      orderId: string;
      points: number;
      valueMinor: number;
      idempotencyKey: string;
      description: string;
    },
  ): Promise<{ balance: number; valueMinor: number }> {
    if (!Number.isInteger(input.points) || !Number.isInteger(input.valueMinor)) {
      return { balance, valueMinor };
    }
    if (input.points === 0 && input.valueMinor === 0) return { balance, valueMinor };
    const existing = await tx.pointEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return { balance, valueMinor };
    const requested = Math.max(-MAX_POINTS, Math.min(MAX_POINTS, input.points));
    const requestedValue = Math.max(-MAX_POINTS, Math.min(MAX_POINTS, input.valueMinor));
    const next = Math.max(0, Math.min(MAX_POINTS, balance + requested));
    const nextValue = Math.max(0, Math.min(MAX_POINTS, valueMinor + requestedValue));
    const applied = next - balance;
    const appliedValue = nextValue - valueMinor;
    if (applied === 0 && appliedValue === 0) return { balance, valueMinor };
    await tx.pointAccount.update({
      where: { id: input.accountId },
      data: { balance: next, valueMinor: nextValue },
    });
    await tx.pointEntry.create({
      data: {
        accountId: input.accountId,
        userId: input.userId,
        orderId: input.orderId,
        points: applied,
        valueMinor: appliedValue,
        balanceAfter: next,
        idempotencyKey: input.idempotencyKey,
        description: input.description.slice(0, 200),
      },
    });
    return { balance: next, valueMinor: nextValue };
  }

  private async readSettings(db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<{ enabled: boolean }> {
    const row = await db.systemMeta.findUnique({ where: { key: SETTINGS_KEY } });
    if (!row?.value) return { enabled: false };
    try {
      const parsed = JSON.parse(row.value) as { enabled?: unknown };
      return { enabled: parsed.enabled === true };
    } catch {
      return { enabled: false };
    }
  }
}
