import { HttpException } from "@nestjs/common";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { LoginThrottle } from "./limits";

const throttle = new LoginThrottle();

export const paddingHash = bcrypt.hashSync("uniqpay-login-padding", 12);

export function sessionStamp(passwordHash: string) {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);
}

/** Throws 429 while this person, address or account has failed too often. `address` may be empty. */
export function assertLoginOpen(subject: string, address = "") {
  if (throttle.blocked(subject, address)) {
    throw new HttpException("Too many sign-in attempts. Wait a few minutes and try again.", 429);
  }
}

export function noteLoginFailure(subject: string, address = "") {
  throttle.fail(subject, address);
}

export function clearLoginFailure(subject: string, address = "") {
  throttle.clear(subject, address);
}
