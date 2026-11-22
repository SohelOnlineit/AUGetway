import { CanActivate, ExecutionContext, HttpException, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import { isLoopback, normalizeAddress, WindowCounter } from "./limits";

export type RateRule = { name: string; limit: number; windowMs: number };

const RULE_KEY = "uniqpay:rate-rule";

/** Applied to every route that has no @RateLimit of its own. */
const DEFAULT_RULE: RateRule = { name: "all", limit: 1200, windowMs: 60_000 };

/** Limits one route (or a whole controller) per client address. Routes with the same name share a counter. */
export const RateLimit = (name: string, limit: number, windowSeconds: number) =>
  SetMetadata(RULE_KEY, { name, limit, windowMs: windowSeconds * 1000 } satisfies RateRule);

/** The visitor's address. The API sits behind nginx, and main.ts trusts exactly that one proxy. */
export function clientAddress(request: Pick<Request, "ip" | "socket">): string {
  return normalizeAddress(request.ip || request.socket?.remoteAddress || "");
}

const shared = new WindowCounter();

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const address = clientAddress(http.getRequest<Request>());
    // A call from this same machine is our own web server, not a visitor.
    if (!address || isLoopback(address)) return true;
    const rule = this.reflector.getAllAndOverride<RateRule | undefined>(RULE_KEY, [context.getHandler(), context.getClass()]) ?? DEFAULT_RULE;
    const wait = shared.hit(`${rule.name}|${address}`, rule.limit, rule.windowMs);
    if (wait > 0) {
      http.getResponse<Response>().setHeader("Retry-After", String(wait));
      throw new HttpException("Too many requests. Wait a moment and try again.", 429);
    }
    return true;
  }
}
