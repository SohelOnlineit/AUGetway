import { HttpException } from "@nestjs/common";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";

const windowMs = 15 * 60 * 1000;
const attemptLimit = 8;
const failures = new Map<string, { count: number; reset: number }>();

export const paddingHash = bcrypt.hashSync("uniqpay-login-padding", 12);

export function sessionStamp(passwordHash: string) {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);
}

export function assertLoginOpen(email: string) {
  const row = failures.get(email);
  if (row && row.reset > Date.now() && row.count >= attemptLimit) {
    throw new HttpException("Too many sign-in attempts. Wait a few minutes and try again.", 429);
  }
}

export function noteLoginFailure(email: string) {
  const now = Date.now();
  const row = failures.get(email);
  if (!row || row.reset <= now) {
    failures.set(email, { count: 1, reset: now + windowMs });
    return;
  }
  row.count += 1;
}

export function clearLoginFailure(email: string) {
  failures.delete(email);
}
