import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { resolveStorefrontId } from "../catalog/storefronts";
import { ContactSettingsService } from "./contact-settings.service";
import { UpdateContactDetailsDto } from "./dto/contact-details.dto";

@Controller("admin")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions("admin:access")
export class ContactSettingsController {
  constructor(private readonly contact: ContactSettingsService) {}

  @Get("contact-details")
  getSettings() {
    return this.contact.getAdmin();
  }

  @Patch("contact-details")
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateContactDetailsDto) {
    return this.contact.update(resolveStorefrontId(dto.shop), dto, user.id);
  }
}
