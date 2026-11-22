import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { DeskGuard, type DeskSession } from "./desk.guard";
import { TwoFactorCodeDto, TwoFactorDisableDto, TwoFactorSetupDto } from "./dto";
import { clientAddress, RateLimit } from "./rate-limit";
import { TwoFactorService } from "./two-factor.service";

type DeskRequest = Request & { desk: DeskSession };

/** Each person sets up the second step for their own account, so these always use the signed-in person, not the desk. */
@Controller("auth/2fa")
@UseGuards(DeskGuard)
@RateLimit("two-factor", 30, 900)
export class TwoFactorController {
  constructor(private readonly twoFactor: TwoFactorService) {}

  @Post("setup")
  setup(@Req() request: DeskRequest, @Body() body: TwoFactorSetupDto) {
    return this.twoFactor.begin(request.desk.actor || request.desk.sub, request.desk.email, body.currentPassword, clientAddress(request));
  }

  @Post("enable")
  enable(@Req() request: DeskRequest, @Body() body: TwoFactorCodeDto) {
    return this.twoFactor.confirm(request.desk.actor || request.desk.sub, body.code, clientAddress(request));
  }

  @Post("disable")
  disable(@Req() request: DeskRequest, @Body() body: TwoFactorDisableDto) {
    return this.twoFactor.disable(request.desk.actor || request.desk.sub, body.currentPassword, body.code, clientAddress(request));
  }
}
