import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import type { DeskSession } from "./desk.guard";

/** True for the main admin, false for a staff account. */
export function isMainAdmin(request: Request & { desk: DeskSession }) {
  return Boolean(request.desk.actor) && request.desk.actor === request.desk.sub;
}

/** Settings that affect every sign-in, and database copies, belong to the main admin only. */
export function requireMainAdmin(request: Request & { desk: DeskSession }, what = "this") {
  if (!request.desk.actor || request.desk.actor !== request.desk.sub) {
    throw new ForbiddenException(`Only the main admin can use ${what}`);
  }
}

/**
 * Payment messages are accepted only from the payment app.
 * A website sign-in cannot register a device or mark an order paid by sending a text.
 * A staff account may use the phone; the token still belongs to that desk, not to the website.
 */
export function requireHandset(request: Request & { desk: DeskSession }) {
  // 401, not 403. The installed app treats 401 as "sign in again" and drops the saved token.
  // A website token left on the phone otherwise stays there, the pulse is refused, and payment SMS show as failed.
  if (request.desk.device !== "handset") {
    throw new UnauthorizedException("Sign in on the payment phone again");
  }
}
