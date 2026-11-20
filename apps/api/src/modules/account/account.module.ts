import { Module } from "@nestjs/common";
import { ContentModule } from "../content/content.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PromotionsModule } from "../promotions/promotions.module";
import { OrdersModule } from "../orders/orders.module";
import { PointsModule } from "../points/points.module";
import { WalletModule } from "../wallet/wallet.module";
import { AccountController } from "./account.controller";
import { AccountService } from "./account.service";

@Module({
  imports: [OrdersModule, WalletModule, NotificationsModule, PromotionsModule, PointsModule, ContentModule],
  controllers: [AccountController],
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}
