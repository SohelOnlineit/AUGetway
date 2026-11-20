import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { resolveStorefrontId } from "../catalog/storefronts";
import { CustomerMessagesService } from "./customer-messages.service";
import {
  BulkCustomerEmailDto,
  BulkCustomerSmsDto,
  CustomerMessagesQueryDto,
  SendCustomerEmailDto,
  SendCustomerSmsDto,
} from "./dto/customer-messages.dto";

@Controller("admin")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions("admin:access")
export class CustomerMessagesController {
  constructor(private readonly messages: CustomerMessagesService) {}

  @Get("customer-messages")
  audience(@Query() query: CustomerMessagesQueryDto) {
    return this.messages.audience(query.productId?.trim() || undefined);
  }

  @Post("customer-messages/sms")
  sms(@CurrentUser() user: AuthenticatedUser, @Body() dto: SendCustomerSmsDto) {
    return this.messages.sendSms(resolveStorefrontId(dto.shop), dto.phone, dto.message, user.id, dto.productId?.trim() || undefined);
  }

  @Post("customer-messages/sms-bulk")
  smsBulk(@CurrentUser() user: AuthenticatedUser, @Body() dto: BulkCustomerSmsDto) {
    return this.messages.sendSmsBulk(resolveStorefrontId(dto.shop), dto.productId?.trim() || undefined, dto.message, user.id);
  }

  @Post("customer-messages/email")
  email(@CurrentUser() user: AuthenticatedUser, @Body() dto: SendCustomerEmailDto) {
    return this.messages.sendEmail(
      resolveStorefrontId(dto.shop),
      dto.email,
      dto.subject,
      dto.message,
      user.id,
      dto.productId?.trim() || undefined,
    );
  }

  @Post("customer-messages/email-bulk")
  emailBulk(@CurrentUser() user: AuthenticatedUser, @Body() dto: BulkCustomerEmailDto) {
    return this.messages.sendEmailBulk(
      resolveStorefrontId(dto.shop),
      dto.productId?.trim() || undefined,
      dto.subject,
      dto.message,
      user.id,
    );
  }
}
