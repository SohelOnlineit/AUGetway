import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { resolveStorefrontId } from "../catalog/storefronts";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { EmailSettingsService } from "../../shared/mail/email-settings.service";
import { EmailTemplatesService } from "../../shared/mail/email-templates.service";
import { EmailChannelDto, SendTestEmailDto, UpdateEmailSettingsDto } from "./dto/email-settings.dto";
import { UpdateEmailTemplateDto } from "./dto/email-template.dto";

@Controller("admin")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions("admin:access")
export class EmailAdminController {
  constructor(
    private readonly email: EmailSettingsService,
    private readonly templates: EmailTemplatesService,
  ) {}

  @Get("email/settings")
  settings() {
    return this.email.getAdmin();
  }

  @Patch("email/settings")
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateEmailSettingsDto) {
    return this.email.update(dto, user.id);
  }

  @Post("email/test-connection")
  testConnection(@Body() dto: EmailChannelDto) {
    return this.email.testConnection(dto.shop, dto.channel);
  }

  @Post("email/test-message")
  async testMessage(@CurrentUser() user: AuthenticatedUser, @Body() dto: SendTestEmailDto) {
    const template = await this.templates.get("system.smtp_test", dto.shop);
    if (!template.enabled) {
      throw new BadRequestException("SMTP Test Email is disabled in the template library.");
    }
    return this.email.sendTest(dto.shop, dto.channel, dto.to, user.id);
  }

  @Get("email/templates")
  templatesList(@Query("shop") shop?: string) {
    return this.templates.list(resolveStorefrontId(shop));
  }

  @Get("email/templates/:id")
  template(@Param("id") id: string, @Query("shop") shop?: string) {
    return this.templates.get(decodeURIComponent(id), resolveStorefrontId(shop));
  }

  @Patch("email/templates/:id")
  updateTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateEmailTemplateDto,
  ) {
    return this.templates.update(decodeURIComponent(id), dto, user.id, dto.shop);
  }

  @Post("email/templates/:id/reset")
  resetTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Query("shop") shop?: string,
  ) {
    return this.templates.reset(decodeURIComponent(id), user.id, resolveStorefrontId(shop));
  }
}
