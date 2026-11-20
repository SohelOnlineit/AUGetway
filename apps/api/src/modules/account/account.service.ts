import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type {
  AccountOverview,
  PublicNotification,
  PublicNotificationPreference,
  PublicProfile,
  PublicWishlistItem,
} from "@amarpin/types";
import { OrderStatus, ProductStatus } from "../../generated/prisma/client";
import { pickPrimaryImageUrl } from "../catalog/catalog.mapper";
import { resolveStorefrontId } from "../catalog/storefronts";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../shared/audit/audit.service";
import { CryptoService } from "../../shared/crypto/crypto.service";
import { NotificationsService } from "../notifications/notifications.service";
import { OrdersService } from "../orders/orders.service";
import { PointsService } from "../points/points.service";
import { WalletService } from "../wallet/wallet.service";
import { UploadsService } from "../content/uploads.service";
import type { ChangeEmailDto } from "./dto/change-email.dto";
import type { ChangePasswordDto } from "./dto/change-password.dto";
import type { UpdateNotificationPrefsDto } from "./dto/update-notification-prefs.dto";
import type { UpdateProfileDto } from "./dto/update-profile.dto";

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
    private readonly orders: OrdersService,
    private readonly wallet: WalletService,
    private readonly points: PointsService,
    private readonly notifications: NotificationsService,
    private readonly uploads: UploadsService,
  ) {}

  async getOverview(userId: string): Promise<AccountOverview> {
    const profile = await this.getProfile(userId);
    const [recentOrders, wallet, wishlistCount, unreadNotificationCount, grouped, points, pointsEnabled, spent] =
      await Promise.all([
        this.orders.listForUser(userId),
        this.wallet.getWalletForUser(userId),
        this.prisma.wishlistItem.count({ where: { userId } }),
        this.prisma.notification.count({
          where: { userId, readAt: null },
        }),
        this.prisma.order.groupBy({
          by: ["status"],
          where: { userId, trashedAt: null },
          _count: { _all: true },
        }),
        this.points.balancesFor(userId),
        this.points.isEnabled(),
        this.prisma.order.aggregate({
          where: {
            userId,
            trashedAt: null,
            status: {
              in: [
                OrderStatus.PAID,
                OrderStatus.FULFILLED,
                OrderStatus.PARTIALLY_REFUNDED,
              ],
            },
          },
          _sum: { totalMinor: true, refundedMinor: true },
        }),
      ]);

    return {
      profile,
      wallet,
      wishlistCount,
      unreadNotificationCount,
      totalSpentMinor: Math.max(
        0,
        (spent._sum.totalMinor ?? 0) - (spent._sum.refundedMinor ?? 0),
      ),
      pointsBalance: points.points,
      pointsValueMinor: points.valueMinor,
      pointsEnabled,
      recentOrders: recentOrders.slice(0, 5),
      orderStatusSummary: grouped.map((row) => ({
        status: row.status as AccountOverview["orderStatusSummary"][number]["status"],
        count: row._count._all,
      })),
    };
  }

  async getProfile(userId: string): Promise<PublicProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      phone: user.phone,
      roles: user.roles,
      status: user.status,
      emailVerified: user.emailVerified,
      theme: user.theme,
      avatarUrl: user.avatarPath,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<PublicProfile> {
    if (
      dto.displayName === undefined &&
      dto.phone === undefined &&
      dto.theme === undefined
    ) {
      throw new BadRequestException("No profile fields to update");
    }

    const data: {
      displayName?: string | null;
      phone?: string | null;
      theme?: "SYSTEM" | "LIGHT" | "DARK";
    } = {};
    if (dto.displayName !== undefined) {
      const trimmed = dto.displayName.trim();
      data.displayName = trimmed.length > 0 ? trimmed : null;
    }
    if (dto.phone !== undefined) {
      const trimmed = dto.phone.trim();
      data.phone = trimmed.length > 0 ? trimmed : null;
    }
    if (dto.theme !== undefined) {
      data.theme = dto.theme;
    }

    await this.prisma.user.update({ where: { id: userId }, data });
    await this.audit.record({
      action: "account.profile_updated",
      userId,
      metadata: { fields: Object.keys(data) },
    });
    return this.getProfile(userId);
  }

  async setAvatar(
    userId: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<PublicProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, avatarPath: true },
    });
    if (!user) throw new NotFoundException("User not found");
    const saved = await this.uploads.saveAvatar(buffer, contentType);
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarPath: saved.path },
    });
    if (user.avatarPath && user.avatarPath !== saved.path) {
      await this.uploads.deletePublicMedia(user.avatarPath);
    }
    await this.audit.record({
      action: "account.avatar_updated",
      userId,
    });
    return this.getProfile(userId);
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");
    if (user.isGuest) {
      throw new BadRequestException("Guest accounts cannot change password");
    }
    const ok = await this.crypto.verifyPassword(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!ok) {
      throw new UnauthorizedException("Current password is incorrect");
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException("New password must differ from current password");
    }
    const passwordHash = await this.crypto.hashPassword(dto.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    await this.audit.record({
      action: "account.password_changed",
      userId,
    });
    return { message: "Password updated" };
  }

  async changeEmail(
    userId: string,
    dto: ChangeEmailDto,
  ): Promise<PublicProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");
    if (user.isGuest) {
      throw new BadRequestException("Guest accounts cannot change email");
    }
    const ok = await this.crypto.verifyPassword(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!ok) {
      throw new UnauthorizedException("Current password is incorrect");
    }
    const nextEmail = dto.newEmail.trim().toLowerCase();
    if (nextEmail === user.email) {
      throw new BadRequestException("New email is the same as your current email");
    }
    const taken = await this.prisma.user.findUnique({
      where: { email: nextEmail },
    });
    if (taken) {
      throw new ConflictException("Email is already in use");
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { email: nextEmail, emailVerified: true },
    });
    await this.audit.record({
      action: "account.email_changed",
      userId,
      metadata: { previousEmail: user.email },
    });
    return this.getProfile(userId);
  }

  async listWishlist(userId: string, storefront?: string): Promise<PublicWishlistItem[]> {
    const items = await this.prisma.wishlistItem.findMany({
      where: { userId },
      include: {
        product: {
          include: {
            images: { orderBy: { sortOrder: "asc" } },
            category: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return items.map((item) => ({
      id: item.id,
      productId: item.productId,
      title: item.product.title,
      slug: item.product.slug,
      priceMinor: item.product.priceMinor,
      currency: item.product.currency,
      primaryImageUrl: pickPrimaryImageUrl(item.product.images, resolveStorefrontId(storefront)),
      available:
        item.product.status === ProductStatus.ACTIVE &&
        item.product.category.isActive,
      createdAt: item.createdAt.toISOString(),
    }));
  }

  async addWishlistItem(
    userId: string,
    productId: string,
    storefront?: string,
  ): Promise<PublicWishlistItem[]> {
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        status: ProductStatus.ACTIVE,
        category: { isActive: true },
      },
    });
    if (!product) {
      throw new BadRequestException("Product is not available");
    }

    await this.prisma.wishlistItem.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: {},
    });

    return this.listWishlist(userId, storefront);
  }

  async removeWishlistItem(
    userId: string,
    itemId: string,
    storefront?: string,
  ): Promise<PublicWishlistItem[]> {
    const item = await this.prisma.wishlistItem.findFirst({
      where: { id: itemId, userId },
    });
    if (!item) throw new NotFoundException("Wishlist item not found");
    await this.prisma.wishlistItem.delete({ where: { id: item.id } });
    return this.listWishlist(userId, storefront);
  }

  async listNotifications(userId: string): Promise<PublicNotification[]> {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      include: { deliveries: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map((row) => this.notifications.toPublic(row));
  }

  async markNotificationRead(
    userId: string,
    notificationId: string,
  ): Promise<PublicNotification> {
    const row = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
      include: { deliveries: true },
    });
    if (!row) throw new NotFoundException("Notification not found");

    const updated = await this.prisma.notification.update({
      where: { id: row.id },
      data: { readAt: row.readAt ?? new Date() },
      include: { deliveries: true },
    });

    return this.notifications.toPublic(updated);
  }

  async markAllNotificationsRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async getNotificationPrefs(
    userId: string,
  ): Promise<PublicNotificationPreference> {
    const prefs = await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    return {
      emailEnabled: prefs.emailEnabled,
      inAppEnabled: prefs.inAppEnabled,
    };
  }

  async updateNotificationPrefs(
    userId: string,
    dto: UpdateNotificationPrefsDto,
  ): Promise<PublicNotificationPreference> {
    if (dto.emailEnabled === undefined && dto.inAppEnabled === undefined) {
      throw new BadRequestException("No preference fields to update");
    }
    const prefs = await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        emailEnabled: dto.emailEnabled ?? true,
        inAppEnabled: dto.inAppEnabled ?? true,
      },
      update: {
        ...(dto.emailEnabled !== undefined
          ? { emailEnabled: dto.emailEnabled }
          : {}),
        ...(dto.inAppEnabled !== undefined
          ? { inAppEnabled: dto.inAppEnabled }
          : {}),
      },
    });
    await this.audit.record({
      action: "account.notification_prefs_updated",
      userId,
      metadata: {
        emailEnabled: prefs.emailEnabled,
        inAppEnabled: prefs.inAppEnabled,
      },
    });
    return {
      emailEnabled: prefs.emailEnabled,
      inAppEnabled: prefs.inAppEnabled,
    };
  }
}
