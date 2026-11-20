import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  AdminWalletAccount,
  AdminWalletActivityItem,
  AdminWalletAdjustResult,
  AdminWalletListPage,
  AdminWalletStats,
} from "@amarpin/types";
import { WalletTransactionType } from "../../generated/prisma/client";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { WalletService } from "../wallet/wallet.service";
import type { AdminWalletAdjustDto, AdminWalletListQuery } from "./dto/wallet-adjust.dto";

const ACTIVE_USER: Prisma.UserWhereInput = { status: { not: "DELETED" } };

/**
 * Admin wallet adjustments must go through WalletService ledger posts.
 * Direct balance updates are forbidden.
 */
@Injectable()
export class AdminWalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  async list(query: AdminWalletListQuery): Promise<AdminWalletListPage> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const balance = query.balance ?? "with";
    const filters: Prisma.UserWhereInput[] = [ACTIVE_USER];
    const q = query.q?.trim();
    if (q) {
      filters.push({
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { displayName: { contains: q, mode: "insensitive" } },
          { id: { equals: q } },
        ],
      });
    }
    if (balance === "with") {
      filters.push({ wallet: { is: { balanceMinor: { gt: 0 } } } });
    } else if (balance === "zero") {
      filters.push({
        OR: [{ wallet: { is: null } }, { wallet: { is: { balanceMinor: 0 } } }],
      });
    }

    const where: Prisma.UserWhereInput = { AND: filters };
    const start = dhakaStartOfToday();
    const [total, rows, accounts, withBalance, walletSum, today] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: {
          wallet: {
            select: {
              balanceMinor: true,
              currency: true,
              updatedAt: true,
              transactions: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { createdAt: true },
              },
            },
          },
        },
        orderBy: [{ wallet: { balanceMinor: "desc" } }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where: ACTIVE_USER }),
      this.prisma.wallet.count({
        where: { balanceMinor: { gt: 0 }, user: ACTIVE_USER },
      }),
      this.prisma.wallet.aggregate({
        where: { user: ACTIVE_USER },
        _sum: { balanceMinor: true },
      }),
      this.prisma.walletTransaction.groupBy({
        by: ["type"],
        where: { createdAt: { gte: start } },
        _sum: { amountMinor: true },
        _count: { _all: true },
      }),
    ]);

    const credit = today.find((row) => row.type === WalletTransactionType.CREDIT);
    const debit = today.find((row) => row.type === WalletTransactionType.DEBIT);
    const stats: AdminWalletStats = {
      accounts,
      withBalance,
      zeroBalance: Math.max(accounts - withBalance, 0),
      totalBalanceMinor: walletSum._sum.balanceMinor ?? 0,
      creditsTodayMinor: credit?._sum.amountMinor ?? 0,
      debitsTodayMinor: debit?._sum.amountMinor ?? 0,
      postedToday: today.reduce((sum, row) => sum + row._count._all, 0),
      currency: "BDT",
    };

    return {
      page,
      pageSize,
      total,
      items: rows.map((row) => this.toAccount(row)),
      stats,
    };
  }

  async activity(): Promise<AdminWalletActivityItem[]> {
    const rows = await this.prisma.walletTransaction.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        wallet: {
          select: {
            user: { select: { id: true, email: true, displayName: true } },
          },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      userId: row.wallet.user.id,
      email: row.wallet.user.email,
      displayName: row.wallet.user.displayName,
      type: row.type,
      amountMinor: row.amountMinor,
      balanceAfterMinor: row.balanceAfterMinor,
      currency: row.currency,
      description: row.description,
      referenceType: row.referenceType,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async adjust(
    actorUserId: string,
    customerId: string,
    dto: AdminWalletAdjustDto,
  ): Promise<AdminWalletAdjustResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: customerId },
    });
    if (!user || user.status === "DELETED") {
      throw new NotFoundException("Customer not found");
    }

    const reason = dto.reason.trim();
    const transaction = await this.wallet.postLedgerEntry({
      userId: customerId,
      type:
        dto.type === "CREDIT"
          ? WalletTransactionType.CREDIT
          : WalletTransactionType.DEBIT,
      amountMinor: dto.amountMinor,
      currency: dto.currency,
      idempotencyKey: dto.idempotencyKey.trim(),
      referenceType: "admin_adjustment",
      referenceId: actorUserId,
      description: reason,
      auditAction: "admin.wallet.adjust",
      actorUserId,
    });

    const wallet = await this.wallet.getWalletForUser(customerId);
    return { wallet, transaction };
  }

  private toAccount(row: {
    id: string;
    email: string;
    displayName: string | null;
    status: string;
    wallet: {
      balanceMinor: number;
      currency: string;
      updatedAt: Date;
      transactions: Array<{ createdAt: Date }>;
    } | null;
  }): AdminWalletAccount {
    return {
      userId: row.id,
      email: row.email,
      displayName: row.displayName,
      status: row.status,
      balanceMinor: row.wallet?.balanceMinor ?? 0,
      currency: row.wallet?.currency ?? "BDT",
      updatedAt: row.wallet?.updatedAt.toISOString() ?? null,
      lastTransactionAt: row.wallet?.transactions[0]?.createdAt.toISOString() ?? null,
    };
  }
}

function dhakaStartOfToday(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return new Date(`${year}-${month}-${day}T00:00:00+06:00`);
}
