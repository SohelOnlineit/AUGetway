import { Injectable, Logger } from "@nestjs/common";
import type { PublicNotification } from "@amarpin/types";
import {
  NotificationChannel,
  NotificationDeliveryStatus,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreateNotificationInput {
  userId: string;
  kind: string;
  title: string;
  body: string;
  href?: string | null;
  /** Dedupes per user+kind when provided. */
  idempotencyKey?: string | null;
  actorUserId?: string | null;
}

/**
 * In-app notifications + multi-channel delivery records.
 * EMAIL/PUSH are recorded as SKIPPED_NO_PROVIDER until a real provider exists —
 * never fake successful external delivery.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async notify(input: CreateNotificationInput): Promise<PublicNotification | null> {
    const prefs = await this.prisma.notificationPreference.upsert({
      where: { userId: input.userId },
      create: { userId: input.userId },
      update: {},
    });

    if (!prefs.inAppEnabled) {
      this.logger.debug(
        `Skipped in-app notification kind=${input.kind} (prefs disabled)`,
      );
      return null;
    }

    if (input.idempotencyKey) {
      const existing = await this.prisma.notification.findUnique({
        where: {
          userId_kind_idempotencyKey: {
            userId: input.userId,
            kind: input.kind,
            idempotencyKey: input.idempotencyKey,
          },
        },
        include: { deliveries: true },
      });
      if (existing) return this.toPublic(existing);
    }

    try {
      const created = await this.prisma.notification.create({
        data: {
          userId: input.userId,
          kind: input.kind,
          title: input.title.slice(0, 200),
          body: input.body.slice(0, 1000),
          href: input.href ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          deliveries: {
            create: [
              {
                channel: NotificationChannel.IN_APP,
                status: NotificationDeliveryStatus.ACCEPTED,
                provider: "in_app",
                attemptedAt: new Date(),
              },
              {
                channel: NotificationChannel.EMAIL,
                status: prefs.emailEnabled
                  ? NotificationDeliveryStatus.SKIPPED_NO_PROVIDER
                  : NotificationDeliveryStatus.SKIPPED_NO_PROVIDER,
                provider: null,
                failureReason: prefs.emailEnabled
                  ? "No email provider configured"
                  : "Email channel disabled by preference",
                attemptedAt: new Date(),
              },
              {
                channel: NotificationChannel.PUSH,
                status: NotificationDeliveryStatus.SKIPPED_NO_PROVIDER,
                provider: null,
                failureReason: "No push provider configured",
                attemptedAt: new Date(),
              },
            ],
          },
        },
        include: { deliveries: true },
      });
      return this.toPublic(created);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code?: string }).code === "P2002" &&
        input.idempotencyKey
      ) {
        const raced = await this.prisma.notification.findUnique({
          where: {
            userId_kind_idempotencyKey: {
              userId: input.userId,
              kind: input.kind,
              idempotencyKey: input.idempotencyKey,
            },
          },
          include: { deliveries: true },
        });
        if (raced) return this.toPublic(raced);
      }
      throw error;
    }
  }

  toPublic(
    row: {
      id: string;
      kind: string;
      title: string;
      body: string;
      href: string | null;
      readAt: Date | null;
      createdAt: Date;
      deliveries?: Array<{
        channel: NotificationChannel;
        status: NotificationDeliveryStatus;
        provider: string | null;
        failureReason: string | null;
        attemptedAt: Date | null;
      }>;
    },
  ): PublicNotification {
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      href: row.href,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      deliveries: (row.deliveries ?? []).map((delivery) => ({
        channel: delivery.channel,
        status: delivery.status,
        provider: delivery.provider,
        failureReason: delivery.failureReason,
        attemptedAt: delivery.attemptedAt?.toISOString() ?? null,
      })),
    };
  }
}
