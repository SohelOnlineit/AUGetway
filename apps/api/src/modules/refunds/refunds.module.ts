import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OrdersModule } from "../orders/orders.module";
import { PointsModule } from "../points/points.module";
import { WalletModule } from "../wallet/wallet.module";
import { REFUND_PORT } from "../payments/refund.port";
import { SandboxRefundProvider } from "../payments/sandbox-refund.provider";
import { AdminPaymentsService } from "./admin-payments.service";
import { RefundsController } from "./refunds.controller";
import { RefundsService } from "./refunds.service";

@Module({
  imports: [OrdersModule, WalletModule, PointsModule],
  controllers: [RefundsController],
  providers: [
    RefundsService,
    AdminPaymentsService,
    SandboxRefundProvider,
    {
      provide: REFUND_PORT,
      inject: [ConfigService, SandboxRefundProvider],
      useFactory: (
        _config: ConfigService,
        sandbox: SandboxRefundProvider,
      ) => {
        // Only sandbox adapter exists. Methods fail closed outside development.
        return sandbox;
      },
    },
  ],
  exports: [RefundsService, AdminPaymentsService],
})
export class RefundsModule {}
