import { BullModule } from "@nestjs/bullmq";
import { Module, forwardRef } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ORDERS_QUEUE, PAYMENTS_QUEUE } from "../../queues/queue.constants";
import { PaymentsProcessor } from "../../queues/payments.processor";
import { OrdersModule } from "../orders/orders.module";
import { PointsModule } from "../points/points.module";
import { StorefrontModule } from "../storefront/storefront.module";
import { PromotionsModule } from "../promotions/promotions.module";
import { PAYMENT_PORT } from "./payment.port";
import { PaymentGatewaySettingsService } from "./payment-gateway-settings.service";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { SandboxPaymentProvider } from "./sandbox-payment.provider";
import { UddoktapayClient } from "./uddoktapay.client";
import { UddoktapayWebhookController } from "./uddoktapay-webhook.controller";

@Module({
  imports: [
    forwardRef(() => OrdersModule),
    PointsModule,
    StorefrontModule,
    PromotionsModule,
    BullModule.registerQueue(
      { name: PAYMENTS_QUEUE },
      { name: ORDERS_QUEUE },
    ),
  ],
  controllers: [PaymentsController, UddoktapayWebhookController],
  providers: [
    PaymentsService,
    PaymentGatewaySettingsService,
    UddoktapayClient,
    PaymentsProcessor,
    SandboxPaymentProvider,
    {
      provide: PAYMENT_PORT,
      inject: [ConfigService, SandboxPaymentProvider],
      useFactory: (
        config: ConfigService,
        sandbox: SandboxPaymentProvider,
      ) => {
        // Only sandbox exists today. Production must not enable it.
        if (SandboxPaymentProvider.isSandboxRuntimeAllowed(config)) {
          return sandbox;
        }
        // Provide a inert object that fails closed if somehow invoked.
        return sandbox;
      },
    },
  ],
  exports: [PaymentsService, PaymentGatewaySettingsService],
})
export class PaymentsModule {}
