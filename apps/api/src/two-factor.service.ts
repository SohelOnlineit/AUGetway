import { BadRequestException, Injectable } from "@nestjs/common";
import bcrypt from "bcryptjs";
import { PrismaService } from "./prisma.service";
import { secretBox } from "./secret-box";
import { assertLoginOpen, clearLoginFailure, noteLoginFailure } from "./session";
import { matchTotp, newTotpSecret, otpauthUrl } from "./totp";

function context(userId: string) {
  return `two-factor:${userId}`;
}

function cleanCode(value: string | undefined) {
  return (value ?? "").replace(/\s/g, "");
}

/**
 * Optional second sign-in step: a 6-digit code from an authenticator app (Google Authenticator, Authy, Microsoft
 * Authenticator and others). It is off until a person sets it up for their own account. Once it is on, the desk
 * and the phone app both ask for the code at sign-in.
 */
@Injectable()
export class TwoFactorService {
  constructor(private readonly prisma: PrismaService) {}

  async enabled(userId: string): Promise<boolean> {
    const row = await this.prisma.twoFactor.findUnique({ where: { userId }, select: { enabled: true } });
    return row?.enabled === true;
  }

  /** Used at sign-in, after the password was right. "off" means this account has no second step. */
  async verifyLogin(userId: string, code: string | undefined): Promise<"off" | "ok" | "missing" | "wrong"> {
    // Emergency switch for a lost phone, like TURNSTILE_OFF: put TWO_FACTOR_OFF=1 in the server .env and restart the API.
    // Sign in with the password, turn two-factor off and on again from the Account page, then remove the line.
    if (process.env.TWO_FACTOR_OFF === "1") return "off";
    const row = await this.prisma.twoFactor.findUnique({ where: { userId } });
    if (!row || !row.enabled) return "off";
    const given = cleanCode(code);
    if (!given) return "missing";
    const step = matchTotp(secretBox().open(row.secret, context(userId)), given, Date.now(), row.lastStep);
    if (step === null) return "wrong";
    // Two requests with the same code race here, and only the first one moves lastStep forward.
    const claimed = await this.prisma.twoFactor.updateMany({ where: { userId, lastStep: { lt: step } }, data: { lastStep: step } });
    return claimed.count === 1 ? "ok" : "wrong";
  }

  /** Step 1. Makes a new secret for the person to add to their authenticator app. It does nothing until confirmed. */
  async begin(userId: string, email: string, password: string, address: string) {
    await this.checkPassword(userId, password, address);
    const existing = await this.prisma.twoFactor.findUnique({ where: { userId }, select: { enabled: true } });
    if (existing?.enabled) throw new BadRequestException("Two-factor sign-in is already on. Turn it off first to set it up again.");
    const secret = newTotpSecret();
    const sealed = secretBox().seal(secret, context(userId));
    await this.prisma.twoFactor.upsert({
      where: { userId },
      create: { userId, secret: sealed, enabled: false, lastStep: 0 },
      update: { secret: sealed, enabled: false, lastStep: 0 },
    });
    return { secret, otpauthUrl: otpauthUrl(secret, email) };
  }

  /** Step 2. The person types a code from the app, which proves the app has the secret. Then it turns on. */
  async confirm(userId: string, code: string, address: string) {
    const subject = `two-factor:${userId}`;
    assertLoginOpen(subject, address);
    const row = await this.prisma.twoFactor.findUnique({ where: { userId } });
    if (!row) throw new BadRequestException("Start the setup first.");
    if (row.enabled) return { enabled: true };
    const step = matchTotp(secretBox().open(row.secret, context(userId)), cleanCode(code), Date.now(), 0);
    if (step === null) {
      noteLoginFailure(subject, address);
      throw new BadRequestException("That code is not right. Check the code in your app and try again.");
    }
    clearLoginFailure(subject, address);
    await this.prisma.twoFactor.update({ where: { userId }, data: { enabled: true, lastStep: step } });
    return { enabled: true };
  }

  /** Needs both the password and a current code, so a stolen sign-in token alone cannot switch it off. */
  async disable(userId: string, password: string, code: string, address: string) {
    await this.checkPassword(userId, password, address);
    const subject = `two-factor:${userId}`;
    assertLoginOpen(subject, address);
    const row = await this.prisma.twoFactor.findUnique({ where: { userId } });
    if (!row || !row.enabled) return { enabled: false };
    const step = matchTotp(secretBox().open(row.secret, context(userId)), cleanCode(code), Date.now(), row.lastStep);
    if (step === null) {
      noteLoginFailure(subject, address);
      throw new BadRequestException("That code is not right. Wait for the next code and try again.");
    }
    await this.prisma.twoFactor.deleteMany({ where: { userId } });
    return { enabled: false };
  }

  private async checkPassword(userId: string, password: string, address: string) {
    const subject = `account:${userId}`;
    assertLoginOpen(subject, address);
    const user = await this.prisma.deskUser.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      noteLoginFailure(subject, address);
      // 400, not 401: a 401 would make the website think the sign-in expired and sign the person out.
      throw new BadRequestException("Current password is wrong");
    }
    clearLoginFailure(subject, address);
  }
}
