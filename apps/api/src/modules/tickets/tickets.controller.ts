import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { TicketStatusActionDto } from "./dto/admin-ticket.dto";
import { TicketReplyDto } from "./dto/ticket-reply.dto";
import { TicketsService } from "./tickets.service";

@Controller("tickets")
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.tickets.listForUser(user.id);
  }

  @Get(":id")
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.tickets.getForUser(user.id, id);
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTicketDto,
    @Headers("x-storefront") storefront?: string,
  ) {
    return this.tickets.createForUser(user.id, dto, storefront);
  }

  @Post(":id/replies")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  reply(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: TicketReplyDto,
    @Headers("x-storefront") storefront?: string,
  ) {
    return this.tickets.replyForUser(user.id, id, dto, storefront);
  }

  @Post(":id/status")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  status(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: TicketStatusActionDto,
  ) {
    return this.tickets.statusActionForUser(
      user.id,
      id,
      dto.action,
      dto.reason,
    );
  }
}
