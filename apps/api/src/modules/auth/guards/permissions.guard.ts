import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Permission } from "@amarpin/types";
import { PERMISSIONS_KEY } from "../decorators/permissions.decorator";
import type { AuthenticatedUser } from "../auth.types";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const handlerPerms =
      this.reflector.get<Permission[]>(PERMISSIONS_KEY, context.getHandler()) ??
      [];
    const classPerms =
      this.reflector.get<Permission[]>(PERMISSIONS_KEY, context.getClass()) ??
      [];
    // Class + method permissions are AND-ed (method does not replace class).
    const required = [...new Set([...classPerms, ...handlerPerms])];
    if (required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException("Authentication required");
    }

    const ok = required.every((permission) =>
      user.permissions.includes(permission),
    );
    if (!ok) {
      throw new ForbiddenException("Insufficient permissions");
    }
    return true;
  }
}
