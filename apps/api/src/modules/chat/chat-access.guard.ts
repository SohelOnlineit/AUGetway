import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { permissionsForRoles, type RoleName } from "@amarpin/types";
import { UserStatus } from "../../generated/prisma/client";
import type { AuthenticatedUser, JwtAccessPayload } from "../auth/auth.types";
import { UsersService } from "../users/users.service";
import { GuestShopperService } from "../storefront/guest-shopper.service";

@Injectable()
export class ChatAccessGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly guests: GuestShopperService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AuthenticatedUser;
    }>();
    const authorization = headerValue(request.headers.authorization);
    if (authorization?.toLowerCase().startsWith("bearer ")) {
      const token = authorization.slice(7).trim();
      let payload: JwtAccessPayload;
      try {
        payload = await this.jwt.verifyAsync<JwtAccessPayload>(token);
      } catch {
        throw new UnauthorizedException();
      }
      if (payload.typ !== "access" || !payload.sub) throw new UnauthorizedException();
      const user = await this.users.findById(payload.sub);
      if (!user || user.status !== UserStatus.ACTIVE || !user.emailVerified) {
        throw new UnauthorizedException();
      }
      const roles = user.roles as RoleName[];
      request.user = {
        id: user.id,
        roles,
        permissions: permissionsForRoles(roles),
        isGuest: false,
      };
      return true;
    }

    const guestToken = headerValue(request.headers["x-guest-token"]);
    if (!guestToken) throw new UnauthorizedException();
    const guest = await this.guests.resolveForChat(guestToken);
    const roles = guest.roles as RoleName[];
    request.user = {
      id: guest.id,
      roles,
      permissions: permissionsForRoles(roles),
      isGuest: true,
    };
    return true;
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
