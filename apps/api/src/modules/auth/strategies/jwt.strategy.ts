import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { permissionsForRoles, type RoleName } from "@amarpin/types";
import { ExtractJwt, Strategy } from "passport-jwt";
import { UserStatus } from "../../../generated/prisma/client";
import { RoleProfilesService } from "../../storefront/role-profiles.service";
import { UsersService } from "../../users/users.service";
import type { AuthenticatedUser, JwtAccessPayload } from "../auth.types";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
    private readonly roleProfiles: RoleProfilesService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("security.jwtAccessSecret"),
    });
  }

  async validate(payload: JwtAccessPayload): Promise<AuthenticatedUser> {
    if (payload.typ !== "access" || !payload.sub) {
      throw new UnauthorizedException();
    }
    const user = await this.users.findById(payload.sub);
    if (!user || user.status !== UserStatus.ACTIVE || !user.emailVerified) {
      throw new UnauthorizedException();
    }
    const roles = user.roles as RoleName[];
    return {
      id: user.id,
      roles,
      permissions: await this.roleProfiles.applyPointsAccess(
        roles,
        await this.roleProfiles.applyCouponAccess(roles, permissionsForRoles(roles)),
      ),
    };
  }
}
