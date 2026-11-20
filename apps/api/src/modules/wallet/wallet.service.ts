import {
  BadRequestException,
  Injectable,
  Logger,
} from "@nestjs/common";
import type {
  PublicWallet,
  PublicWalletTransaction,
} from "@amarpin/types";
import { DEFAULT_CURRENCY } from "@amarpin/types";
import {
  WalletTransactionStatus,
  WalletTransactionType,
  type Prisma,
  type Wallet,
  type WalletTransaction,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../shared/audit/audit.service";

export type WalletLedgerPostInput = {
  userId: string;
  type: WalletTransactionType;
  amountMinor: number;
  currency?: string;
  idempotencyKey: string;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  /** Required for any balance mutation — recorded in audit metadata. */
  auditAction: string;
  actorUserId?: string | null;
};

/**
 * Wallet ledger foundation.
 * Public HTTP surface is read-only. Balance changes only via `postLedgerEntry`
 * (no controller wiring in this milestone — top-up/checkout/refund later).
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getWalletForUser(userId: string): Promise<PublicWallet> {
    const wallet = await this.getOrCreateWallet(userId);
    return this.toPublicWallet(wallet);
  }

  async listTransactionsForUser(
    userId: string,
    limit = 50,
  ): Promise<PublicWalletTransaction[]> {
    const wallet = await this.getOrCreateWallet(userId);
    const rows = await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 100),
    });
    return rows.map((row) => this.toPublicTransaction(row));
  }

  /**
   * Internal-only ledger writer. Not exposed on any controller.
   * Enforces serializable lock, idempotency, non-negative balance, and audit.
   */
  async postLedgerEntry(
    input: WalletLedgerPostInput,
  ): Promise<PublicWalletTransaction> {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new BadRequestException("amountMinor must be a positive integer");
    }
    if (!input.idempotencyKey?.trim()) {
      throw new BadRequestException("idempotencyKey is required");
    }
    if (!input.auditAction?.trim()) {
      throw new BadRequestException("auditAction is required for ledger posts");
    }

    const currency = (input.currency ?? DEFAULT_CURRENCY).toUpperCase();

    const posted = await this.prisma.$transaction(
      async (tx) => {
        await this.ensureWalletRow(tx, input.userId, currency);

        const locked = await tx.$queryRaw<
          Array<{
            id: string;
            userId: string;
            currency: string;
            balanceMinor: number;
            version: number;
          }>
        >`
          SELECT id, "userId", currency, "balanceMinor", version
          FROM wallets
          WHERE "userId" = ${input.userId}
          FOR UPDATE
        `;
        const wallet = locked[0];
        if (!wallet) {
          throw new BadRequestException("Wallet not found");
        }
        if (wallet.currency !== currency) {
          throw new BadRequestException("Currency mismatch for wallet");
        }

        const existing = await tx.walletTransaction.findUnique({
          where: {
            walletId_idempotencyKey: {
              walletId: wallet.id,
              idempotencyKey: input.idempotencyKey.trim(),
            },
          },
        });
        if (existing) {
          return existing;
        }

        const nextBalance =
          input.type === WalletTransactionType.CREDIT
            ? wallet.balanceMinor + input.amountMinor
            : wallet.balanceMinor - input.amountMinor;

        if (nextBalance < 0) {
          throw new BadRequestException("Insufficient wallet balance");
        }

        const created = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: input.type,
            amountMinor: input.amountMinor,
            balanceAfterMinor: nextBalance,
            currency,
            status: WalletTransactionStatus.POSTED,
            referenceType: input.referenceType ?? null,
            referenceId: input.referenceId ?? null,
            description: input.description ?? null,
            idempotencyKey: input.idempotencyKey.trim(),
          },
        });

        const updated = await tx.wallet.updateMany({
          where: {
            id: wallet.id,
            version: wallet.version,
            balanceMinor: wallet.balanceMinor,
          },
          data: {
            balanceMinor: nextBalance,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          throw new Error("WALLET_CONCURRENCY_CONFLICT");
        }

        return created;
      },
      { isolationLevel: "Serializable", timeout: 15_000 },
    );

    await this.audit.record({
      action: input.auditAction,
      userId: input.actorUserId ?? input.userId,
      entityType: "wallet_transaction",
      entityId: posted.id,
      metadata: {
        targetUserId: input.userId,
        walletTransactionId: posted.id,
        type: posted.type,
        amountMinor: posted.amountMinor,
        currency: posted.currency,
        referenceType: posted.referenceType,
        referenceId: posted.referenceId,
        idempotencyKey: posted.idempotencyKey,
      },
    });

    this.logger.log(
      `Ledger ${posted.type} posted walletTx=${posted.id} amountMinor=${posted.amountMinor}`,
    );
    return this.toPublicTransaction(posted);
  }

  private async getOrCreateWallet(userId: string): Promise<Wallet> {
    return this.prisma.$transaction(async (tx) => {
      await this.ensureWalletRow(tx, userId, DEFAULT_CURRENCY);
      return tx.wallet.findUniqueOrThrow({ where: { userId } });
    });
  }

  private async ensureWalletRow(
    tx: Prisma.TransactionClient,
    userId: string,
    currency: string,
  ): Promise<void> {
    await tx.wallet.upsert({
      where: { userId },
      create: {
        userId,
        currency,
        balanceMinor: 0,
        version: 0,
      },
      update: {},
    });
  }

  private toPublicWallet(wallet: Wallet): PublicWallet {
    return {
      id: wallet.id,
      currency: wallet.currency,
      balanceMinor: wallet.balanceMinor,
      updatedAt: wallet.updatedAt.toISOString(),
    };
  }

  private toPublicTransaction(
    row: WalletTransaction,
  ): PublicWalletTransaction {
    return {
      id: row.id,
      type: row.type,
      amountMinor: row.amountMinor,
      balanceAfterMinor: row.balanceAfterMinor,
      currency: row.currency,
      status: row.status,
      referenceType: row.referenceType,
      referenceId: row.referenceId,
      description: row.description,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
