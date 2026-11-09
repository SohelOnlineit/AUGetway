import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

export type DeskSession = { sub: string; email: string; actor?: string };

@Injectable()
export class DeskGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { desk?: DeskSession }>();
    const header = request.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) {
      throw new UnauthorizedException("Sign in required");
    }
    try {
      const payload = await this.jwt.verifyAsync<DeskSession>(token);
      request.desk = payload;
      return true;
    } catch {
      throw new UnauthorizedException("Sign in required");
    }
  }
}
