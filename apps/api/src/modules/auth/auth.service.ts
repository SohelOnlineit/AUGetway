import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { permissionsForRoles, type RoleName } from "@amarpin/types";
import { randomUUID } from "node:crypto";
import {
  Role,
  UserStatus,
  VerificationPurpose,
  type User,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../shared/audit/audit.service";
import { RegistrationEmailDomainsService } from "../../shared/security/registration-email-domains.service";
import { CryptoService } from "../../shared/crypto/crypto.service";
import { MailService } from "../../shared/mail/mail.service";
import { RedisService } from "../../shared/redis/redis.service";
import { toPublicUser } from "../users/users.mapper";
import { UsersService } from "../users/users.service";
import {
  ACCESS_TOKEN_TTL_SEC,
  AUTH_ACCOUNT_INACTIVE,
  AUTH_EMAIL_NOT_VERIFIED,
  AUTH_GENERIC_RESET,
  AUTH_GENERIC_VERIFY_RESEND,
  AUTH_INVALID_CREDENTIALS,
  EMAIL_VERIFY_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  REFRESH_TOKEN_TTL_SEC,
} from "./auth.constants";
import type {
  AuthResult,
  AuthTokens,
  JwtAccessPayload,
  MessageResult,
  RegisterResult,
  RequestMeta,
} from "./auth.types";
import type {
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  RequestPasswordResetDto,
  ResendVerificationDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from "./dto";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly mail: MailService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly registrationEmailDomains: RegistrationEmailDomainsService,
    private readonly redis: RedisService,
  ) {}

  /** Hash compared against when the account does not exist, so response time does not reveal it. */
  private dummyHash: Promise<string> | null = null;

  /** Per-account failure counters (Redis). Fails open if Redis is down; IP throttling still applies. */
  private async assertNotLocked(scope: string, id: string, max: number) {
    try {
      const count = Number((await this.redis.client.get(`auth:fail:${scope}:${id}`)) ?? 0);
      if (count >= max) {
        throw new HttpException(
          "Too many failed attempts. Please wait a while and try again.",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn(`auth lock check skipped: ${error instanceof Error ? error.message : "redis"}`);
    }
  }

  private async recordFailure(scope: string, id: string, windowSec: number) {
    try {
      const key = `auth:fail:${scope}:${id}`;
      const count = await this.redis.client.incr(key);
      if (count === 1) await this.redis.client.expire(key, windowSec);
    } catch {
      /* fail open */
    }
  }

  private async clearFailures(scope: string, id: string) {
    try {
      await this.redis.client.del(`auth:fail:${scope}:${id}`);
    } catch {
      /* ignore */
    }
  }

  async register(dto: RegisterDto, meta: RequestMeta): Promise<RegisterResult> {
    const email = dto.email.trim().toLowerCase();
    await this.registrationEmailDomains.assertRegistrationAllowed(email);
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new ConflictException("Email already registered");
    }

    const readiness = await this.mail.readiness(meta.storefront);
    if (!readiness.ready) {
      throw new ServiceUnavailableException(
        readiness.message ?? "Email service is unavailable",
      );
    }

    const passwordHash = await this.crypto.hashPassword(dto.password);
    const user = await this.users.create({
      email,
      passwordHash,
      displayName: dto.displayName,
      roles: [Role.CUSTOMER],
      status: UserStatus.PENDING,
      emailVerified: false,
      storefront: meta.storefront,
    });

    const delivery = await this.issueEmailVerification(user, meta.storefront);
    await this.audit.record({
      action: "auth.register",
      userId: user.id,
      ipHash: this.crypto.hashIp(meta.ip),
      metadata: { roles: user.roles },
    });

    return {
      userId: user.id,
      emailVerificationRequired: true,
      message: "Registration successful. Please verify your email before signing in.",
      devPreview: this.maybeDevPreview(delivery.devPreview),
    };
  }

  async login(dto: LoginDto, meta: RequestMeta): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();
    await this.assertNotLocked("login", email, 10);
    const user = await this.users.findByEmail(email);
    if (!user) {
      // Burn the same bcrypt time as a real check so timing cannot reveal whether the email exists.
      this.dummyHash ??= this.crypto.hashPassword(randomUUID());
      await this.crypto.verifyPassword(dto.password, await this.dummyHash);
      await this.recordFailure("login", email, 15 * 60);
      await this.audit.record({
        action: "auth.login_failed",
        ipHash: this.crypto.hashIp(meta.ip),
        metadata: { reason: "unknown_user" },
      });
      throw new UnauthorizedException(AUTH_INVALID_CREDENTIALS);
    }

    const passwordOk = await this.crypto.verifyPassword(
      dto.password,
      user.passwordHash,
    );
    if (!passwordOk) {
      await this.recordFailure("login", email, 15 * 60);
      await this.audit.record({
        action: "auth.login_failed",
        userId: user.id,
        ipHash: this.crypto.hashIp(meta.ip),
        metadata: { reason: "bad_password" },
      });
      throw new UnauthorizedException(AUTH_INVALID_CREDENTIALS);
    }

    await this.clearFailures("login", email);

    if (this.crypto.isLegacyPasswordHash(user.passwordHash)) {
      const passwordHash = await this.crypto.hashPassword(dto.password);
      await this.users.updatePassword(user.id, passwordHash);
      user.passwordHash = passwordHash;
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException(AUTH_EMAIL_NOT_VERIFIED);
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(AUTH_ACCOUNT_INACTIVE);
    }

    const tokens = await this.issueSession(user, meta);
    await this.audit.record({
      action: "auth.login",
      userId: user.id,
      ipHash: this.crypto.hashIp(meta.ip),
      metadata: { roles: user.roles },
    });

    return { user: toPublicUser(user), tokens };
  }

  async refresh(dto: RefreshTokenDto, meta: RequestMeta): Promise<AuthResult> {
    const presentedHash = this.crypto.hashToken(dto.refreshToken);
    const session = await this.prisma.authSession.findUnique({
      where: { refreshTokenHash: presentedHash },
    });

    if (!session) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (session.revokedAt) {
      // Concurrent refresh grace: React Strict Mode / parallel tabs often
      // present the same token twice within milliseconds of rotation.
      // If this token was just rotated, mint a fresh pair instead of
      // wiping the whole family (true theft reuse is still blocked after grace).
      const graceMs = 15_000;
      const ageMs = Date.now() - session.revokedAt.getTime();
      if (session.replacedById && ageMs >= 0 && ageMs <= graceMs) {
        const user = await this.users.findById(session.userId);
        if (user && user.status === UserStatus.ACTIVE && user.emailVerified) {
          return this.rotateFromFamily(user, session.familyId, meta);
        }
      }

      await this.revokeFamily(session.familyId, "refresh_reuse");
      await this.audit.record({
        action: "auth.refresh_reuse_detected",
        userId: session.userId,
        ipHash: this.crypto.hashIp(meta.ip),
        metadata: { familyId: session.familyId },
      });
      this.logger.warn(`Refresh reuse detected for family=${session.familyId}`);
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.prisma.authSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException("Invalid refresh token");
    }

    const user = await this.users.findById(session.userId);
    if (!user || user.status !== UserStatus.ACTIVE || !user.emailVerified) {
      await this.revokeFamily(session.familyId, "user_inactive");
      throw new UnauthorizedException("Invalid refresh token");
    }

    return this.rotateSession(user, session.id, session.familyId, meta);
  }

  private async rotateFromFamily(
    user: User,
    familyId: string,
    meta: RequestMeta,
  ): Promise<AuthResult> {
    const tip = await this.prisma.authSession.findFirst({
      where: { familyId, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!tip || tip.expiresAt.getTime() <= Date.now()) {
      await this.revokeFamily(familyId, "refresh_grace_expired");
      throw new UnauthorizedException("Invalid refresh token");
    }
    return this.rotateSession(user, tip.id, familyId, meta);
  }

  private async rotateSession(
    user: User,
    currentSessionId: string,
    familyId: string,
    meta: RequestMeta,
  ): Promise<AuthResult> {
    const rawRefresh = this.crypto.generateOpaqueToken();
    const nextHash = this.crypto.hashToken(rawRefresh);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000);

    const nextSession = await this.prisma.authSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: nextHash,
        familyId,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
        ipHash: this.crypto.hashIp(meta.ip),
        expiresAt,
      },
    });

    await this.prisma.authSession.update({
      where: { id: currentSessionId },
      data: {
        revokedAt: new Date(),
        replacedById: nextSession.id,
      },
    });

    const accessToken = await this.signAccessToken(user);
    await this.audit.record({
      action: "auth.refresh",
      userId: user.id,
      ipHash: this.crypto.hashIp(meta.ip),
      metadata: { familyId },
    });

    return {
      user: toPublicUser(user),
      tokens: {
        accessToken,
        refreshToken: rawRefresh,
        accessTokenExpiresIn: ACCESS_TOKEN_TTL_SEC,
        tokenType: "Bearer",
      },
    };
  }

  async logout(refreshToken: string | undefined, meta: RequestMeta): Promise<MessageResult> {
    if (!refreshToken) {
      return { message: "Signed out" };
    }
    const hash = this.crypto.hashToken(refreshToken);
    const session = await this.prisma.authSession.findUnique({
      where: { refreshTokenHash: hash },
    });
    if (session && !session.revokedAt) {
      await this.prisma.authSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      await this.audit.record({
        action: "auth.logout",
        userId: session.userId,
        ipHash: this.crypto.hashIp(meta.ip),
        metadata: { familyId: session.familyId },
      });
    }
    return { message: "Signed out" };
  }

  async verifyEmail(dto: VerifyEmailDto, meta: RequestMeta): Promise<AuthResult & MessageResult> {
    const { tokenHash, lockId } = await this.resolveOneTimeSecret(dto, "verify");
    if (lockId) await this.assertNotLocked("verify", lockId, 5);
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash },
    });
    if (
      !record ||
      record.purpose !== VerificationPurpose.EMAIL_VERIFY ||
      record.usedAt ||
      record.expiresAt.getTime() <= Date.now()
    ) {
      if (lockId) await this.recordFailure("verify", lockId, 30 * 60);
      throw new BadRequestException("Invalid or expired verification code");
    }
    if (lockId) await this.clearFailures("verify", lockId);

    await this.prisma.$transaction([
      this.prisma.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          emailVerified: true,
          status: UserStatus.ACTIVE,
        },
      }),
    ]);

    const user = await this.users.findById(record.userId);
    if (!user) throw new BadRequestException("Invalid or expired verification code");

    const tokens = await this.issueSession(user, meta);
    await this.audit.record({
      action: "auth.email_verified",
      userId: record.userId,
      ipHash: this.crypto.hashIp(meta.ip),
    });

    return { message: "Email verified.", user: toPublicUser(user), tokens };
  }

  async resendVerification(
    dto: ResendVerificationDto,
    meta: RequestMeta,
  ): Promise<MessageResult> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.users.findByEmail(email);
    const generic: MessageResult = { message: AUTH_GENERIC_VERIFY_RESEND };

    if (!user || user.emailVerified) {
      return generic;
    }

    const shop = user.storefront === "uniqbd" ? "uniqbd" : "amarpin";
    const readiness = await this.mail.readiness(shop);
    if (!readiness.ready) {
      throw new ServiceUnavailableException(
        readiness.message ?? "Email service is unavailable",
      );
    }

    const delivery = await this.issueEmailVerification(user, shop);
    await this.audit.record({
      action: "auth.verification_resent",
      userId: user.id,
      ipHash: this.crypto.hashIp(meta.ip),
    });

    return {
      ...generic,
      devPreview: this.maybeDevPreview(delivery.devPreview),
    };
  }

  async requestPasswordReset(
    dto: RequestPasswordResetDto,
    meta: RequestMeta,
  ): Promise<MessageResult> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.users.findByEmail(email);
    const generic: MessageResult = { message: AUTH_GENERIC_RESET };

    if (!user) {
      return generic;
    }

    const shop = meta.storefront ?? (user.storefront === "uniqbd" ? "uniqbd" : "amarpin");
    const readiness = await this.mail.readiness(shop);
    if (!readiness.ready) {
      // Still return generic to avoid account enumeration; log readiness issue without PII.
      this.logger.warn("Password reset requested but mail provider is not ready");
      return generic;
    }

    const rawToken = this.crypto.generateOpaqueToken();
    const code = this.crypto.generateNumericCode(6);
    // Store hashes for both URL token and code so either can verify.
    const tokenHash = this.crypto.hashToken(rawToken);
    const codeHash = this.codeHash(user.id, code);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

    await this.prisma.verificationToken.createMany({
      data: [
        {
          userId: user.id,
          purpose: VerificationPurpose.PASSWORD_RESET,
          tokenHash,
          expiresAt,
        },
        {
          userId: user.id,
          purpose: VerificationPurpose.PASSWORD_RESET,
          tokenHash: codeHash,
          expiresAt,
        },
      ],
    });

    const delivery = await this.mail.sendPasswordReset({
      userId: user.id,
      email: user.email,
      token: rawToken,
      code,
      storefront: shop,
    });

    await this.audit.record({
      action: "auth.password_reset_requested",
      userId: user.id,
      ipHash: this.crypto.hashIp(meta.ip),
    });

    return {
      ...generic,
      devPreview: this.maybeDevPreview(delivery.devPreview),
    };
  }

  async resetPassword(dto: ResetPasswordDto, meta: RequestMeta): Promise<MessageResult> {
    const { tokenHash, lockId } = await this.resolveOneTimeSecret(dto, "reset");
    if (lockId) await this.assertNotLocked("reset", lockId, 5);
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash },
    });
    if (
      !record ||
      record.purpose !== VerificationPurpose.PASSWORD_RESET ||
      record.usedAt ||
      record.expiresAt.getTime() <= Date.now()
    ) {
      if (lockId) await this.recordFailure("reset", lockId, 30 * 60);
      throw new BadRequestException("Invalid or expired reset token");
    }
    if (lockId) await this.clearFailures("reset", lockId);

    const passwordHash = await this.crypto.hashPassword(dto.newPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      await tx.verificationToken.updateMany({
        where: {
          userId: record.userId,
          purpose: VerificationPurpose.PASSWORD_RESET,
          usedAt: null,
        },
        data: { usedAt: new Date() },
      });
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      });
      await tx.authSession.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    await this.audit.record({
      action: "auth.password_reset",
      userId: record.userId,
      ipHash: this.crypto.hashIp(meta.ip),
    });

    return { message: "Password updated. Sign in with your new password." };
  }

  /** Short codes are stored per user, so one account's code can never match another's. */
  private codeHash(userId: string, code: string): string {
    return this.crypto.hashToken(`code:${userId}:${code}`);
  }

  /**
   * Long email-link tokens are looked up directly. Short codes must come with the
   * account email, and failed guesses are counted per account.
   */
  private async resolveOneTimeSecret(
    dto: { token?: string; code?: string; email?: string },
    purpose: "verify" | "reset",
  ): Promise<{ tokenHash: string; lockId: string | null }> {
    if (dto.token) {
      return { tokenHash: this.crypto.hashToken(dto.token), lockId: null };
    }
    if (!dto.code) {
      throw new BadRequestException("token or code is required");
    }
    if (!dto.email) {
      throw new BadRequestException("email is required with the code");
    }
    const user = await this.users.findByEmail(dto.email.trim().toLowerCase());
    const failMessage =
      purpose === "verify" ? "Invalid or expired verification code" : "Invalid or expired reset token";
    if (!user) {
      throw new BadRequestException(failMessage);
    }
    return { tokenHash: this.codeHash(user.id, dto.code), lockId: user.id };
  }

  private async issueEmailVerification(user: User, storefront?: "amarpin" | "uniqbd") {
    const code = this.crypto.generateNumericCode(4);
    const expiresAt = new Date(Date.now() + EMAIL_VERIFY_TTL_MS);

    await this.prisma.verificationToken.create({
      data: {
        userId: user.id,
        purpose: VerificationPurpose.EMAIL_VERIFY,
        tokenHash: this.codeHash(user.id, code),
        expiresAt,
      },
    });

    return this.mail.sendEmailVerification({
      userId: user.id,
      email: user.email,
      code,
      storefront,
    });
  }

  private async issueSession(user: User, meta: RequestMeta): Promise<AuthTokens> {
    const rawRefresh = this.crypto.generateOpaqueToken();
    const familyId = randomUUID();
    await this.prisma.authSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: this.crypto.hashToken(rawRefresh),
        familyId,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
        ipHash: this.crypto.hashIp(meta.ip),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000),
      },
    });

    const accessToken = await this.signAccessToken(user);
    return {
      accessToken,
      refreshToken: rawRefresh,
      accessTokenExpiresIn: ACCESS_TOKEN_TTL_SEC,
      tokenType: "Bearer",
    };
  }

  private async signAccessToken(user: User): Promise<string> {
    const payload: JwtAccessPayload = {
      sub: user.id,
      roles: user.roles as RoleName[],
      typ: "access",
    };
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>("security.jwtAccessSecret"),
      expiresIn: ACCESS_TOKEN_TTL_SEC,
    });
  }

  private async revokeFamily(familyId: string, reason: string) {
    await this.prisma.authSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.logger.warn(`Revoked refresh family=${familyId} reason=${reason}`);
  }

  private maybeDevPreview(preview?: { actionUrl?: string; code?: string }) {
    const nodeEnv = this.config.get<string>("app.nodeEnv") ?? "development";
    if (nodeEnv === "production") return undefined;
    const provider = this.config.get<string>("mail.provider") ?? "noop";
    if (provider !== "dev") return undefined;
    return preview;
  }

  /** Expose permissions helper for admin probe endpoints. */
  permissionsFor(user: User) {
    return permissionsForRoles(user.roles as RoleName[]);
  }
}
