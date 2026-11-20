import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CreateRefundDto } from "./dto/create-refund.dto";
import { RefundsService } from "./refunds.service";

@Controller("refunds")
@UseGuards(JwtAuthGuard)
export class RefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.refunds.listForUser(user.id);
  }

  @Get(":id")
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.refunds.getForUser(user.id, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRefundDto,
  ) {
    return this.refunds.requestForUser(user.id, dto);
  }
}
