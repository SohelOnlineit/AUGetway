import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { PaymentsService } from "./payments.service";

@Controller("payments/webhooks")
export class UddoktapayWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post("uddoktapay")
  @HttpCode(200)
  async uddoktapay(@Body() body: unknown) {
    await this.payments.handleUddoktaWebhook(body);
    return { ok: true };
  }
}
