import { Controller, Get, UseGuards } from "@nestjs/common";
import { permissionsForRoles, type RoleName } from "@amarpin/types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { RoleProfilesService } from "../storefront/role-profiles.service";
import { UsersService } from "./users.service";
import { toPublicUser } from "./users.mapper";

@Controller("users")
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly roleProfiles: RoleProfilesService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@CurrentUser() authUser: AuthenticatedUser) {
    const user = await this.users.findById(authUser.id);
    if (!user) {
      return null;
    }
    const publicUser = toPublicUser(user);
    return {
      ...publicUser,
      permissions: await this.roleProfiles.applyPointsAccess(
        publicUser.roles as RoleName[],
        await this.roleProfiles.applyCouponAccess(
          publicUser.roles as RoleName[],
          permissionsForRoles(publicUser.roles as RoleName[]),
        ),
      ),
    };
  }
}
