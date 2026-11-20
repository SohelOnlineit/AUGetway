import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { storefrontFromHeaders } from "../catalog/storefronts";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./decorators/current-user.decorator";
import { RequirePermissions } from "./decorators/permissions.decorator";
import {
  LoginDto,
  LogoutDto,
  RefreshTokenDto,
  RegisterDto,
  RequestPasswordResetDto,
  ResendVerificationDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from "./dto";
import type { AuthenticatedUser } from "./auth.types";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { PermissionsGuard } from "./guards/permissions.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("register")
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, this.meta(req));
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post("login")
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, this.meta(req));
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post("refresh")
  refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.auth.refresh(dto, this.meta(req));
  }

  @HttpCode(200)
  @Post("logout")
  logout(@Body() dto: LogoutDto, @Req() req: Request) {
    return this.auth.logout(dto.refreshToken, this.meta(req));
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post("verify-email")
  verifyEmail(@Body() dto: VerifyEmailDto, @Req() req: Request) {
    return this.auth.verifyEmail(dto, this.meta(req));
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post("resend-verification")
  resendVerification(@Body() dto: ResendVerificationDto, @Req() req: Request) {
    return this.auth.resendVerification(dto, this.meta(req));
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post("forgot-password")
  forgotPassword(@Body() dto: RequestPasswordResetDto, @Req() req: Request) {
    return this.auth.requestPasswordReset(dto, this.meta(req));
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post("reset-password")
  resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.auth.resetPassword(dto, this.meta(req));
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("admin:access")
  @HttpCode(200)
  @Post("admin/ping")
  adminPing(@CurrentUser() user: AuthenticatedUser) {
    return {
      ok: true,
      userId: user.id,
      roles: user.roles,
      permissions: user.permissions,
    };
  }

  private meta(req: Request) {
    return {
      ip: req.ip || undefined,
      userAgent: req.headers["user-agent"],
      storefront: storefrontFromHeaders(req.headers),
    };
  }
}
