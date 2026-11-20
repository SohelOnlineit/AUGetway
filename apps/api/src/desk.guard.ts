import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { PrismaService } from "./prisma.service";
import { sessionStamp } from "./session";

export type DeskSession = { sub: string; email: string; actor?: string; stamp?: string };

@Injectable()
export class DeskGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { desk?: DeskSession }>();
    const header = request.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) throw new UnauthorizedException("Sign in required");
    try {
      const payload = await this.jwt.verifyAsync<DeskSession>(token);
      const actor = payload.actor || payload.sub;
      if (!actor || !payload.stamp) throw new UnauthorizedException("Sign in required");
      const user = await this.prisma.deskUser.findUnique({
        where: { id: actor },
        select: { id: true, deskId: true, passwordHash: true },
      });
      const deskId = user ? user.deskId ?? user.id : "";
      if (!user || payload.stamp !== sessionStamp(user.passwordHash) || payload.sub !== deskId) {
        throw new UnauthorizedException("Sign in required");
      }
      request.desk = { sub: deskId, email: payload.email, actor: user.id };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException("Sign in required");
    }
  }
}
