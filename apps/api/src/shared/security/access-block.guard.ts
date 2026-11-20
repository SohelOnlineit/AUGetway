import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { isIP } from "node:net";
import { AccessBlockService } from "./access-block.service";

function header(req: Request, name: string): string {
  const value = req.headers[name];
  const text = Array.isArray(value) ? value[0] : value;
  return (text ?? "").trim();
}

function clientIp(req: Request): string | undefined {
  const raw = (req.ip || req.socket?.remoteAddress || "").replace(/^::ffff:/, "").trim();
  return raw && isIP(raw) ? raw : undefined;
}

function clientCountry(req: Request): string | undefined {
  const code = (header(req, "cf-ipcountry") || header(req, "x-country-code")).toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : undefined;
}

/**
 * Stops shop traffic from a blocked IP or Cloudflare country.
 * Admin routes stay open so staff can remove a block that matches their own network.
 */
@Injectable()
export class AccessBlockGuard implements CanActivate {
  constructor(private readonly blocks: AccessBlockService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;
    const req = context.switchToHttp().getRequest<Request>();
    const path = (req.originalUrl || req.url || "").split("?")[0] ?? "";
    if (path.includes("/health") || path.includes("/admin")) return true;

    const result = await this.blocks.check(clientIp(req), clientCountry(req));
    if (!result.blocked) return true;
    if (result.type === "ip") {
      throw new ForbiddenException("Access from your IP address is blocked.");
    }
    throw new ForbiddenException("Access from your country is blocked.");
  }
}
