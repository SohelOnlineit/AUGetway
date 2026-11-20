import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  AdminAuditDetail,
  AdminAuditListItem,
  AdminPage,
} from "@amarpin/types";
import { type Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { AdminAuditListQuery } from "./dto/audit.dto";

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: AdminAuditListQuery,
  ): Promise<AdminPage<AdminAuditListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.AuditEventWhereInput = {};
    if (query.action?.trim()) {
      where.action = { contains: query.action.trim(), mode: "insensitive" };
    }
    if (query.actorUserId) where.userId = query.actorUserId;
    if (query.entityType?.trim()) where.entityType = query.entityType.trim();
    if (query.entityId?.trim()) where.entityId = query.entityId.trim();
    if (query.q?.trim()) {
      where.OR = [
        { action: { contains: query.q.trim(), mode: "insensitive" } },
        { entityId: { contains: query.q.trim(), mode: "insensitive" } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.auditEvent.count({ where }),
      this.prisma.auditEvent.findMany({
        where,
        include: { user: { select: { email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: rows.map((row) => ({
        id: row.id,
        action: row.action,
        actorUserId: row.userId,
        actorEmail: row.user?.email ?? null,
        entityType: row.entityType,
        entityId: row.entityId,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async get(id: string): Promise<AdminAuditDetail> {
    const row = await this.prisma.auditEvent.findUnique({
      where: { id },
      include: { user: { select: { email: true } } },
    });
    if (!row) throw new NotFoundException("Audit event not found");

    return {
      id: row.id,
      action: row.action,
      actorUserId: row.userId,
      actorEmail: row.user?.email ?? null,
      entityType: row.entityType,
      entityId: row.entityId,
      createdAt: row.createdAt.toISOString(),
      metadata: this.scrubMetadata(row.metadata),
      ipHash: row.ipHash,
    };
  }

  private scrubMetadata(
    metadata: Prisma.JsonValue | null,
  ): Record<string, unknown> | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return null;
    }
    const blocked = new Set([
      "password",
      "token",
      "secret",
      "code",
      "codes",
      "refreshToken",
      "accessToken",
      "ciphertext",
      "codeCiphertext",
    ]);
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (blocked.has(key.toLowerCase())) continue;
      out[key] = value;
    }
    return out;
  }
}
