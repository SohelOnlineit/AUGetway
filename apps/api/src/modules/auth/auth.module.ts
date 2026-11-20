import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { RoleProfilesModule } from "../storefront/role-profiles.module";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PermissionsGuard } from "./guards/permissions.guard";
import { JwtStrategy } from "./strategies/jwt.strategy";

@Module({
  imports: [
    UsersModule,
    RoleProfilesModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("security.jwtAccessSecret"),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, PermissionsGuard],
  exports: [AuthService, JwtModule, PassportModule, PermissionsGuard],
})
export class AuthModule {}
