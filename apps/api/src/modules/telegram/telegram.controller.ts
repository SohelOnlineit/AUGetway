import { Body, Controller, Get, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { resolveStorefrontId } from "../catalog/storefronts";
import { TelegramShopDto, UpdateTelegramDto } from "./dto/telegram.dto";
import { TelegramService } from "./telegram.service";

@Controller("admin")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions("admin:access")
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  @Get("telegram")
  getSettings() {
    return this.telegram.getAdmin();
  }

  @Patch("telegram")
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateTelegramDto) {
    return this.telegram.update(resolveStorefrontId(dto.shop), dto, user.id);
  }

  @Post("telegram/test")
  test(@CurrentUser() user: AuthenticatedUser, @Body() dto: TelegramShopDto) {
    return this.telegram.sendTest(resolveStorefrontId(dto.shop), user.id);
  }
}
