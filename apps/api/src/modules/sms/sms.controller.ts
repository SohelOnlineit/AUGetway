import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { resolveStorefrontId } from "../catalog/storefronts";
import { SmsShopDto, TestSmsDto, UpdateSmsGatewayDto, UpsertSmsTemplateDto } from "./dto/sms.dto";
import { SmsGatewayService } from "./sms.service";

@Controller("admin")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions("admin:access")
export class SmsController {
  constructor(private readonly sms: SmsGatewayService) {}

  @Get("sms-gateway")
  getGateway() {
    return this.sms.getAdmin();
  }

  @Patch("sms-gateway")
  updateGateway(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateSmsGatewayDto) {
    return this.sms.update(resolveStorefrontId(dto.shop), dto, user.id);
  }

  @Post("sms-gateway/test-connection")
  testConnection(@Body() dto: SmsShopDto) {
    return this.sms.testConnection(resolveStorefrontId(dto.shop));
  }

  @Post("sms-gateway/test-sms")
  testSms(@CurrentUser() user: AuthenticatedUser, @Body() dto: TestSmsDto) {
    return this.sms.sendTest(resolveStorefrontId(dto.shop), dto.phone, user.id);
  }

  @Get("sms-templates")
  templates(@Query("shop") shop?: string) {
    return this.sms.listTemplates(resolveStorefrontId(shop));
  }

  @Post("sms-templates")
  createTemplate(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertSmsTemplateDto) {
    return this.sms.createTemplate(resolveStorefrontId(dto.shop), dto, user.id);
  }

  @Patch("sms-templates/:id")
  updateTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpsertSmsTemplateDto,
  ) {
    return this.sms.updateTemplate(resolveStorefrontId(dto.shop), id, dto, user.id);
  }
}
