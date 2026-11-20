import { Module } from "@nestjs/common";
import { AnalyticsModule } from "../analytics/analytics.module";
import { AuthModule } from "../auth/auth.module";
import { ChatModule } from "../chat/chat.module";
import { ContentModule } from "../content/content.module";
import { PromotionsModule } from "../promotions/promotions.module";
import { OrdersModule } from "../orders/orders.module";
import { PointsModule } from "../points/points.module";
import { PaymentsModule } from "../payments/payments.module";
import { RefundsModule } from "../refunds/refunds.module";
import { TicketsModule } from "../tickets/tickets.module";
import { WalletModule } from "../wallet/wallet.module";
import { AdminAuditService } from "./admin-audit.service";
import { AdminCatalogService } from "./admin-catalog.service";
import { AdminCustomersService } from "./admin-customers.service";
import { AdminDashboardService } from "./admin-dashboard.service";
import { AdminInventoryService } from "./admin-inventory.service";
import { AdminOrdersService } from "./admin-orders.service";
import { AdminSecurityService } from "./admin-security.service";
import { AdminSeoService } from "./admin-seo.service";
import { AdminWalletService } from "./admin-wallet.service";
import { AdminController } from "./admin.controller";

@Module({
  imports: [
    AuthModule,
    WalletModule,
    OrdersModule,
    PointsModule,
    PaymentsModule,
    RefundsModule,
    TicketsModule,
    ChatModule,
    AnalyticsModule,
    ContentModule,
    PromotionsModule,
  ],
  controllers: [AdminController],
  providers: [
    AdminDashboardService,
    AdminCatalogService,
    AdminInventoryService,
    AdminOrdersService,
    AdminCustomersService,
    AdminWalletService,
    AdminAuditService,
    AdminSecurityService,
    AdminSeoService,
  ],
})
export class AdminModule {}
