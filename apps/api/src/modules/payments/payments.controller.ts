import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { randomUUID } from "node:crypto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ShopperGuard } from "../storefront/shopper.guard";
import { CreatePaymentIntentDto } from "./dto/create-payment-intent.dto";
import { SandboxConfirmDto } from "./dto/sandbox-confirm.dto";
import { VerifyUddoktaPayDto } from "./dto/uddoktapay.dto";
import { PaymentsService } from "./payments.service";

@Controller("payments")
@UseGuards(ShopperGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post("intents")
  createIntent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePaymentIntentDto,
  ) {
    const idempotencyKey = dto.idempotencyKey?.trim() || randomUUID();
    return this.payments.createIntentForUser(
      user.id,
      dto.orderId,
      idempotencyKey,
    );
  }

  @Get("intents/:id")
  getIntent(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.payments.getIntentForUser(user.id, id);
  }

  /**
   * Development-only sandbox confirmation.
   * Hidden in production (404) — never trusts a client “paid” flag.
   */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("sandbox/confirm")
  sandboxConfirm(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SandboxConfirmDto,
  ) {
    if (!this.payments.isSandboxUiAllowed()) {
      throw new NotFoundException();
    }
    return this.payments.sandboxSimulateForUser(
      user.id,
      dto.paymentIntentId,
      dto.outcome ?? "success",
    );
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post("uddoktapay/verify")
  verifyUddokta(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyUddoktaPayDto,
  ) {
    return this.payments.confirmUddoktaForUser(user.id, dto.orderId, dto.invoiceId, {
      paymentMethod: dto.paymentMethod,
      transactionId: dto.transactionId,
    });
  }
}
