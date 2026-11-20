import { ForbiddenException } from "@nestjs/common";
import type { Request } from "express";
import type { DeskSession } from "./desk.guard";

/** Settings that affect every sign-in, and database copies, belong to the main admin only. */
export function requireMainAdmin(request: Request & { desk: DeskSession }, what = "this") {
  if (!request.desk.actor || request.desk.actor !== request.desk.sub) {
    throw new ForbiddenException(`Only the main admin can use ${what}`);
  }
}
