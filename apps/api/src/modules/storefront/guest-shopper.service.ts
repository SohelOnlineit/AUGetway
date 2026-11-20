import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Prisma, Role, UserStatus, type User } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CryptoService } from "../../shared/crypto/crypto.service";
import { RoleProfilesService } from "./role-profiles.service";

const GUEST_TOKEN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const GUEST_OFF = "Guest orders are turned off. Please sign in to place an order.";

@Injectable()
export class GuestShopperService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly roles: RoleProfilesService,
  ) {}

  async resolve(token: string): Promise<User> {
    if (!(await this.roles.guestOrdersEnabled())) {
      throw new ForbiddenException(GUEST_OFF);
    }
    return this.resolveGuest(token);
  }

  async resolveForChat(token: string): Promise<User> {
    if (!(await this.roles.guestLiveChatEnabled())) {
      throw new ForbiddenException("Live chat without an account is turned off. Please sign in.");
    }
    return this.resolveGuest(token);
  }

  private async resolveGuest(token: string): Promise<User> {
    if (!GUEST_TOKEN.test(token)) throw new UnauthorizedException();
    const existing = await this.prisma.user.findUnique({ where: { guestToken: token } });
    if (existing) {
      if (
        !existing.isGuest ||
        existing.status === UserStatus.SUSPENDED ||
        existing.status === UserStatus.DELETED
      ) {
        throw new ForbiddenException(GUEST_OFF);
      }
      return existing;
    }

    const passwordHash = await this.crypto.hashPassword(this.crypto.generateOpaqueToken());
    try {
      return await this.prisma.user.create({
        data: {
          email: `guest.${token}@guests.amarpin.invalid`,
          passwordHash,
          status: UserStatus.ACTIVE,
          emailVerified: false,
          displayName: "Guest",
          roles: [Role.CUSTOMER],
          isGuest: true,
          guestToken: token,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const raced = await this.prisma.user.findUnique({ where: { guestToken: token } });
        if (raced?.isGuest) return raced;
      }
      throw error;
    }
  }
}
