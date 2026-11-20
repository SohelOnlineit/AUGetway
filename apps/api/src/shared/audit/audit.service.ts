import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    action: string;
    userId?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    ipHash?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.prisma.auditEvent.create({
        data: {
          action: input.action,
          userId: input.userId ?? null,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          ipHash: input.ipHash ?? null,
          metadata: (input.metadata ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to persist audit event ${input.action}: ${message}`);
    }
  }
}
