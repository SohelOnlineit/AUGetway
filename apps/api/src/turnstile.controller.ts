import { Body, Controller, Get, Put, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { DeskGuard, type DeskSession } from "./desk.guard";
import { UpdateTurnstileDto } from "./dto";
import { requireMainAdmin } from "./main-admin";
import { TurnstileService } from "./turnstile.service";

type DeskRequest = Request & { desk: DeskSession };

@Controller()
export class TurnstileController {
  constructor(private readonly turnstile: TurnstileService) {}

  /** The site key is public. It is empty while the check is off. The secret never leaves the API. */
  @Get("security/turnstile")
  async site() {
    return { siteKey: await this.turnstile.siteKey() };
  }

  @Get("desk/security/turnstile")
  @UseGuards(DeskGuard)
  view(@Req() request: DeskRequest) {
    requireMainAdmin(request, "security settings");
    return this.turnstile.adminView();
  }

  @Put("desk/security/turnstile")
  @UseGuards(DeskGuard)
  save(@Req() request: DeskRequest, @Body() body: UpdateTurnstileDto) {
    requireMainAdmin(request, "security settings");
    return this.turnstile.update({
      siteKey: body.siteKey,
      secretKey: body.secretKey,
      enabled: body.enabled,
      token: body.turnstileToken,
    });
  }
}
