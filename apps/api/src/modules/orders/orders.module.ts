import { BullModule } from "@nestjs/bullmq";
import { Module, forwardRef } from "@nestjs/common";
import { PaymentsModule } from "../payments/payments.module";
import { CartModule } from "../cart/cart.module";
import { StorefrontModule } from "../storefront/storefront.module";
import { PromotionsModule } from "../promotions/promotions.module";
import { SmsModule } from "../sms/sms.module";
import { TelegramModule } from "../telegram/telegram.module";
import { PointsModule } from "../points/points.module";
import { WalletModule } from "../wallet/wallet.module";
import { ORDERS_QUEUE } from "../../queues/queue.constants";
import { OrdersProcessor } from "../../queues/orders.processor";
import { FulfillmentService } from "./fulfillment.service";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [
    CartModule,
    StorefrontModule,
    PromotionsModule,
    WalletModule,
    PointsModule,
    TelegramModule,
    SmsModule,
    BullModule.registerQueue({ name: ORDERS_QUEUE }),
    forwardRef(() => PaymentsModule),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, FulfillmentService, OrdersProcessor],
  exports: [OrdersService, FulfillmentService],
})
export class OrdersModule {}
