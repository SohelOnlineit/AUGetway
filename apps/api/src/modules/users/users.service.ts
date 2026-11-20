import { Injectable } from "@nestjs/common";
import { Role, UserStatus, type User } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(input: {
    email: string;
    passwordHash: string;
    displayName?: string;
    roles?: Role[];
    status?: UserStatus;
    emailVerified?: boolean;
    storefront?: "amarpin" | "uniqbd";
  }): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: input.email.trim().toLowerCase(),
        passwordHash: input.passwordHash,
        displayName: input.displayName?.trim() || null,
        roles: input.roles ?? [Role.CUSTOMER],
        status: input.status ?? UserStatus.PENDING,
        emailVerified: input.emailVerified ?? false,
        storefront: input.storefront === "uniqbd" ? "uniqbd" : "amarpin",
      },
    });
  }

  markEmailVerified(userId: string): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerified: true,
        status: UserStatus.ACTIVE,
      },
    });
  }

  updatePassword(userId: string, passwordHash: string): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }
}
