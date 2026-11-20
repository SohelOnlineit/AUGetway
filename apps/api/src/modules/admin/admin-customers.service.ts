import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AdminCustomerDetail,
  AdminCustomerListItem,
  AdminCustomerListPage,
} from "@amarpin/types";
import { Role, UserStatus, type Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../shared/audit/audit.service";
import { CryptoService } from "../../shared/crypto/crypto.service";
import { WalletService } from "../wallet/wallet.service";
import { AdminOrdersService } from "./admin-orders.service";
import { maskPhone } from "./admin.util";
import type {
  AdminCustomerListQuery,
  CreateAdminCustomerDto,
  CreateAdminStaffDto,
  UpdateAdminCustomerDto,
  UpdateAdminCustomerNoteDto,
} from "./dto/customers.dto";

@Injectable()
export class AdminCustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly wallet: WalletService,
    private readonly orders: AdminOrdersService,
    private readonly crypto: CryptoService,
  ) {}

  async list(
    query: AdminCustomerListQuery,
  ): Promise<AdminCustomerListPage> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.UserWhereInput = { isGuest: false, status: { not: UserStatus.DELETED } };
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { email: { contains: q, mode: "insensitive" } },
        { displayName: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
        { id: { equals: q } },
      ];
    }
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [total, rows, everyone, active, pending, suspended, withBalance, walletSum, joinedToday] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: {
          _count: { select: { orders: true } },
          wallet: { select: { balanceMinor: true, currency: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where: { isGuest: false, status: { not: UserStatus.DELETED } } }),
      this.prisma.user.count({ where: { isGuest: false, status: "ACTIVE" } }),
      this.prisma.user.count({ where: { isGuest: false, status: "PENDING" } }),
      this.prisma.user.count({ where: { isGuest: false, status: "SUSPENDED" } }),
      this.prisma.wallet.count({ where: { balanceMinor: { gt: 0 } } }),
      this.prisma.wallet.aggregate({ _sum: { balanceMinor: true } }),
      this.prisma.user.count({
        where: { isGuest: false, status: { not: UserStatus.DELETED }, createdAt: { gte: startOfToday } },
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: rows.map((row) => this.toListItem(row)),
      stats: {
        total: everyone,
        active,
        pending,
        suspended,
        withBalance,
        walletMinor: walletSum._sum.balanceMinor ?? 0,
        joinedToday,
      },
    };
  }

  async get(id: string): Promise<AdminCustomerDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { _count: { select: { orders: true } } },
    });
    if (!user) throw new NotFoundException("Customer not found");

    const [wallet, recentOrders] = await Promise.all([
      this.wallet.getWalletForUser(user.id),
      this.orders.list({ customerId: user.id, page: 1, pageSize: 5 }),
    ]);

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      emailVerified: user.emailVerified,
      roles: user.roles,
      orderCount: user._count.orders,
      walletBalanceMinor: wallet.balanceMinor,
      currency: wallet.currency,
      createdAt: user.createdAt.toISOString(),
      phoneMasked: maskPhone(user.phone),
      adminNote: user.adminNote,
      avatarUrl: user.avatarPath,
      wallet,
      recentOrders: recentOrders.items,
    };
  }

  async updateNote(
    actorUserId: string,
    customerId: string,
    dto: UpdateAdminCustomerNoteDto,
  ): Promise<AdminCustomerDetail> {
    const existing = await this.prisma.user.findUnique({
      where: { id: customerId },
    });
    if (!existing) throw new NotFoundException("Customer not found");

    await this.prisma.user.update({
      where: { id: customerId },
      data: {
        adminNote:
          dto.adminNote === undefined
            ? existing.adminNote
            : dto.adminNote?.trim() || null,
      },
    });

    await this.audit.record({
      action: "admin.customer.note",
      userId: actorUserId,
      entityType: "user",
      entityId: customerId,
    });

    return this.get(customerId);
  }

  async updateProfile(
    actorUserId: string,
    customerId: string,
    dto: UpdateAdminCustomerDto,
  ): Promise<AdminCustomerDetail> {
    const existing = await this.prisma.user.findUnique({ where: { id: customerId } });
    if (!existing) throw new NotFoundException("Customer not found");

    const roles = dto.roles?.length ? dto.roles : dto.roles ? [Role.CUSTOMER] : undefined;
    if (
      actorUserId === customerId &&
      existing.roles.includes(Role.ADMINISTRATOR) &&
      roles &&
      !roles.includes(Role.ADMINISTRATOR)
    ) {
      throw new BadRequestException("You cannot remove your own administrator role");
    }

    await this.prisma.user.update({
      where: { id: customerId },
      data: {
        ...(dto.displayName !== undefined ? { displayName: dto.displayName?.trim() || null } : {}),
        ...(dto.status ? { status: dto.status as UserStatus } : {}),
        ...(dto.emailVerified !== undefined ? { emailVerified: dto.emailVerified } : {}),
        ...(roles ? { roles: roles as Role[] } : {}),
        ...(dto.phone?.trim() ? { phone: dto.phone.trim() } : {}),
      },
    });

    await this.audit.record({
      action: "admin.customer.update",
      userId: actorUserId,
      entityType: "user",
      entityId: customerId,
    });

    return this.get(customerId);
  }

  async remove(actorUserId: string, customerId: string): Promise<{ ok: true }> {
    if (actorUserId === customerId) {
      throw new BadRequestException("You cannot delete your own account");
    }
    const existing = await this.prisma.user.findUnique({ where: { id: customerId } });
    if (!existing || existing.isGuest || existing.status === UserStatus.DELETED) {
      throw new NotFoundException("Customer not found");
    }
    if (existing.roles.includes(Role.ADMINISTRATOR)) {
      throw new BadRequestException("Administrator accounts stay on the staff list");
    }

    await this.prisma.authSession.updateMany({
      where: { userId: customerId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.prisma.user.update({
      where: { id: customerId },
      data: {
        status: UserStatus.DELETED,
        email: `deleted.${customerId}@removed.invalid`,
        displayName: "Deleted customer",
        phone: null,
        emailVerified: false,
        passwordHash: await this.crypto.hashPassword(this.crypto.generateOpaqueToken()),
      },
    });
    await this.audit.record({
      action: "admin.customer.delete",
      userId: actorUserId,
      entityType: "user",
      entityId: customerId,
    });
    return { ok: true };
  }

  async createCustomer(actorUserId: string, dto: CreateAdminCustomerDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException("That email is already registered");

    const displayName = dto.displayName?.trim() || email.split("@")[0] || "Customer";
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await this.crypto.hashPassword(dto.password),
        displayName,
        roles: [Role.CUSTOMER],
        status: UserStatus.ACTIVE,
        emailVerified: true,
      },
    });
    await this.audit.record({
      action: "admin.customer.create",
      userId: actorUserId,
      entityType: "user",
      entityId: user.id,
      metadata: { email: user.email },
    });
    return this.get(user.id);
  }

  async listStaff() {
    const rows = await this.prisma.user.findMany({
      where: { isGuest: false, roles: { has: Role.ADMINISTRATOR } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
        emailVerified: true,
        createdAt: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      status: row.status,
      emailVerified: row.emailVerified,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createStaff(actorUserId: string, dto: CreateAdminStaffDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException("That email is already registered");

    const displayName = dto.displayName?.trim() || email.split("@")[0] || "Administrator";
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await this.crypto.hashPassword(dto.password),
        displayName,
        roles: [Role.ADMINISTRATOR],
        status: UserStatus.ACTIVE,
        emailVerified: true,
      },
    });
    await this.audit.record({
      action: "admin.staff.create",
      userId: actorUserId,
      entityType: "user",
      entityId: user.id,
      metadata: { email: user.email },
    });
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private toListItem(row: {
    id: string;
    email: string;
    displayName: string | null;
    status: UserStatus;
    emailVerified: boolean;
    roles: Role[];
    createdAt: Date;
    _count: { orders: number };
    wallet: { balanceMinor: number; currency: string } | null;
  }): AdminCustomerListItem {
    return {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      status: row.status,
      emailVerified: row.emailVerified,
      roles: row.roles,
      orderCount: row._count.orders,
      walletBalanceMinor: row.wallet?.balanceMinor ?? 0,
      currency: row.wallet?.currency ?? "BDT",
      createdAt: row.createdAt.toISOString(),
    };
  }
}
