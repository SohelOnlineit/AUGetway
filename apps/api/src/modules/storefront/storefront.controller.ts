import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { RoleProfilesService } from "./role-profiles.service";

@Controller()
export class StorefrontController {
  constructor(private readonly roles: RoleProfilesService) {}

  @Get("storefront/guest-orders")
  async guestOrders() {
    return { enabled: await this.roles.guestOrdersEnabled() };
  }

  @Get("storefront/live-chat")
  async liveChat() {
    const [guestChat, guestPictures] = await Promise.all([
      this.roles.guestLiveChatEnabled(),
      this.roles.chatPicturesEnabled([], true),
    ]);
    return { guestChat, guestPictures };
  }

  @Get("admin/role-profiles")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("admin:access")
  async getRoleProfiles() {
    return { overrides: await this.roles.getOverrides() };
  }

  @Put("admin/role-profiles")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("admin:access")
  async saveRoleProfiles(@Body() body: unknown) {
    return { overrides: await this.roles.saveOverrides(body) };
  }
}
