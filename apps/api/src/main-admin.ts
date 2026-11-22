import { ForbiddenException } from "@nestjs/common";
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
 * Payment messages are accepted only from the main admin's phone.
 * A website sign-in, and a staff account, cannot register a device or mark an order paid by sending a text.
 */
export function requireHandset(request: Request & { desk: DeskSession }) {
  if (request.desk.device !== "handset") {
    throw new ForbiddenException("Only the payment phone can send payment messages");
  }
  requireMainAdmin(request, "the payment phone");
}
