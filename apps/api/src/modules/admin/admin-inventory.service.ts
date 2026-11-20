import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AdminInventoryUnit, AdminPage } from "@amarpin/types";
import {
  InventoryStatus,
  type Prisma,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../shared/audit/audit.service";
import { CryptoService } from "../../shared/crypto/crypto.service";
import { maskSecret } from "./admin.util";
import type {
  AddInventoryCodesDto,
  AddManualInventoryCodeDto,
  AdminInventoryListQuery,
  UpdateInventoryUnitStatusDto,
} from "./dto/inventory.dto";
import { splitStockCodes } from "./stock-codes";

@Injectable()
export class AdminInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  async availablePackages(productId: string): Promise<{ items: Array<{ packageValueId: string; available: number }> }> {
    const id = productId.trim();
    if (!id) throw new BadRequestException("Product is required");
    const rows = await this.prisma.inventoryItem.groupBy({
      by: ["packageValueId"],
      where: {
        productId: id,
        status: InventoryStatus.AVAILABLE,
        packageValueId: { not: null },
      },
      _count: { _all: true },
    });
    return {
      items: rows.flatMap((row) =>
        row.packageValueId ? [{ packageValueId: row.packageValueId, available: row._count._all }] : [],
      ),
    };
  }

  async list(
    query: AdminInventoryListQuery,
  ): Promise<AdminPage<AdminInventoryUnit>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.InventoryItemWhereInput = {};
    if (query.productId) where.productId = query.productId;
    if (query.status) where.status = query.status;
    const packageValueId = query.packageValueId?.trim();
    if (packageValueId) {
      where.OR = [{ packageValueId }, { packageValueId: null }];
    }
    const needle = query.q?.trim().toLowerCase() ?? "";

    if (needle) {
      const rows = await this.prisma.inventoryItem.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });
      const matched = rows.filter((row) => {
        try {
          return this.crypto.decryptSecret(row.codeCiphertext).toLowerCase().includes(needle);
        } catch {
          return false;
        }
      });
      const start = (page - 1) * pageSize;
      return {
        page,
        pageSize,
        total: matched.length,
        items: matched.slice(start, start + pageSize).map((row) => this.toPublicUnit(row)),
      };
    }

    const [total, rows] = await Promise.all([
      this.prisma.inventoryItem.count({ where }),
      this.prisma.inventoryItem.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: rows.map((row) => this.toPublicUnit(row)),
    };
  }

  /**
   * Import plaintext codes from admin input, encrypt at rest.
   * Never returns or logs plaintext.
   */
  async addCodes(
    actorUserId: string,
    dto: AddInventoryCodesDto,
  ): Promise<{ created: number; duplicates: number }> {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) throw new NotFoundException("Product not found");
    const packageValueId = dto.packageValueId?.trim() || null;
    if (packageValueId && !packageExists(product.variationMeta, packageValueId)) {
      throw new BadRequestException("That package is not on this product");
    }

    const stored = await this.prisma.inventoryItem.findMany({
      where: {
        status: {
          in: [InventoryStatus.AVAILABLE, InventoryStatus.RESERVED, InventoryStatus.SOLD],
        },
      },
      select: { codeCiphertext: true },
    });
    const existing = new Set<string>();
    for (const row of stored) {
      try {
        existing.add(this.crypto.decryptSecret(row.codeCiphertext));
      } catch {
        // A code that cannot be read cannot be matched.
      }
    }
    const split = splitStockCodes(existing, dto.codes);
    if (split.fresh.length === 0 && split.duplicates.length === 0) {
      throw new BadRequestException("No valid codes provided");
    }
    if (split.fresh.length === 0) {
      throw new BadRequestException(
        split.duplicates.length === 1
          ? "This code is already in stock or has been sold."
          : `${split.duplicates.length} codes are already in stock or have been sold and were not added.`,
      );
    }

    const payloads = split.fresh.map((plaintext) => ({
      productId: dto.productId,
      packageValueId,
      codeCiphertext: this.crypto.encryptSecret(plaintext),
      status: InventoryStatus.AVAILABLE,
    }));

    await this.prisma.inventoryItem.createMany({ data: payloads });

    await this.audit.record({
      action: "admin.inventory.import",
      userId: actorUserId,
      entityType: "product",
      entityId: dto.productId,
      metadata: { created: payloads.length, duplicates: split.duplicates.length },
    });

    return { created: payloads.length, duplicates: split.duplicates.length };
  }

  /** One code typed by staff while delivering an order. Plaintext is never returned or logged. */
  async addManualCode(
    actorUserId: string,
    dto: AddManualInventoryCodeDto,
  ): Promise<AdminInventoryUnit> {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) throw new NotFoundException("Product not found");
    const packageValueId = dto.packageValueId?.trim() || null;
    if (packageValueId && !packageExists(product.variationMeta, packageValueId)) {
      throw new BadRequestException("That package is not on this product");
    }
    const code = dto.code.trim();
    if (code.length < 4) throw new BadRequestException("Enter a redeem code");

    const stored = await this.prisma.inventoryItem.findMany({
      where: {
        status: {
          in: [InventoryStatus.AVAILABLE, InventoryStatus.RESERVED, InventoryStatus.SOLD],
        },
      },
      select: { codeCiphertext: true },
    });
    for (const row of stored) {
      try {
        if (this.crypto.decryptSecret(row.codeCiphertext) === code) {
          throw new BadRequestException("This code is already in stock or has been sold.");
        }
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
      }
    }

    const created = await this.prisma.inventoryItem.create({
      data: {
        productId: dto.productId,
        packageValueId,
        codeCiphertext: this.crypto.encryptSecret(code),
        status: InventoryStatus.AVAILABLE,
      },
    });
    await this.audit.record({
      action: "admin.inventory.manual",
      userId: actorUserId,
      entityType: "inventory_item",
      entityId: created.id,
      metadata: { productId: dto.productId, packageValueId },
    });
    return this.toPublicUnit(created);
  }

  async updateUnitStatus(
    actorUserId: string,
    unitId: string,
    dto: UpdateInventoryUnitStatusDto,
  ): Promise<AdminInventoryUnit> {
    const unit = await this.prisma.inventoryItem.findUnique({
      where: { id: unitId },
    });
    if (!unit) throw new NotFoundException("Inventory unit not found");

    if (
      unit.status === InventoryStatus.SOLD ||
      unit.status === InventoryStatus.RESERVED
    ) {
      throw new BadRequestException(
        "Sold or reserved units cannot be edited",
      );
    }

    if (
      dto.status === "AVAILABLE" &&
      unit.status !== InventoryStatus.DISABLED
    ) {
      throw new BadRequestException("Unit is already available");
    }
    if (
      dto.status === "DISABLED" &&
      unit.status !== InventoryStatus.AVAILABLE
    ) {
      throw new BadRequestException("Only available units can be disabled");
    }

    const updated = await this.prisma.inventoryItem.update({
      where: { id: unitId },
      data: { status: dto.status as InventoryStatus },
    });

    await this.audit.record({
      action: "admin.inventory.status",
      userId: actorUserId,
      entityType: "inventory_item",
      entityId: unitId,
      metadata: { from: unit.status, to: dto.status },
    });

    return this.toPublicUnit(updated);
  }

  /** One code for the admin who is delivering it. Never logged. */
  async revealCode(actorUserId: string, unitId: string): Promise<{ code: string }> {
    const unit = await this.prisma.inventoryItem.findUnique({
      where: { id: unitId },
    });
    if (!unit) throw new NotFoundException("Inventory unit not found");
    const code = this.crypto.decryptSecret(unit.codeCiphertext);
    await this.audit.record({
      action: "admin.inventory.reveal",
      userId: actorUserId,
      entityType: "inventory_item",
      entityId: unitId,
    });
    return { code };
  }


  private toPublicUnit(row: {
    id: string;
    productId: string;
    packageValueId: string | null;
    codeCiphertext: string;
    status: InventoryStatus;
    reservedOrderId: string | null;
    reservedUntil: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): AdminInventoryUnit {
    let code = "";
    try {
      code = this.crypto.decryptSecret(row.codeCiphertext).trim();
    } catch {
      code = "";
    }
    return {
      id: row.id,
      productId: row.productId,
      packageValueId: row.packageValueId,
      status: row.status,
      codeMasked: code || maskSecret(`xx${row.id.slice(-6)}`),
      reservedOrderId: row.reservedOrderId,
      reservedUntil: row.reservedUntil?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function packageExists(meta: unknown, valueId: string) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  const packages = (meta as { packages?: unknown }).packages;
  if (!Array.isArray(packages)) return false;
  return packages.some((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    return (item as { valueId?: unknown }).valueId === valueId;
  });
}