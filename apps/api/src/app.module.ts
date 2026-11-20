import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import {
  appConfig,
  databaseConfig,
  mailConfig,
  paymentsConfig,
  redisConfig,
  securityConfig,
} from "./config/app.config";
import { envValidationSchema } from "./config/env.validation";
import { AccountModule } from "./modules/account/account.module";
import { AdminModule } from "./modules/admin/admin.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CartModule } from "./modules/cart/cart.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { ChatModule } from "./modules/chat/chat.module";
import { ContentModule } from "./modules/content/content.module";
import { HealthModule } from "./modules/health/health.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { RefundsModule } from "./modules/refunds/refunds.module";
import { EmailAdminModule } from "./modules/email/email-admin.module";
import { SmsModule } from "./modules/sms/sms.module";
import { ContactSettingsModule } from "./modules/contact/contact-settings.module";
import { CustomerMessagesModule } from "./modules/messages/customer-messages.module";
import { TelegramModule } from "./modules/telegram/telegram.module";
import { StorefrontModule } from "./modules/storefront/storefront.module";
import { TicketsModule } from "./modules/tickets/tickets.module";
import { UsersModule } from "./modules/users/users.module";
import { WalletModule } from "./modules/wallet/wallet.module";
import { PrismaModule } from "./prisma/prisma.module";
import { QueuesModule } from "./queues/queues.module";
import { AuditModule } from "./shared/audit/audit.module";
import { CryptoModule } from "./shared/crypto/crypto.module";
import { EventsModule } from "./shared/events/events.module";
import { MailModule } from "./shared/mail/mail.module";
import { RedisModule } from "./shared/redis/redis.module";
import { AccessBlockGuard } from "./shared/security/access-block.guard";
import { AccessBlockModule } from "./shared/security/access-block.module";
import { RegistrationEmailDomainsModule } from "./shared/security/registration-email-domains.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      envFilePath: [".env", "../../.env"],
      load: [
        appConfig,
        databaseConfig,
        redisConfig,
        securityConfig,
        mailConfig,
        paymentsConfig,
      ],
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
        convert: true,
      },
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>("app.logLevel") ?? "info",
          redact: {
            paths: [
              "req.headers.authorization",
              "req.headers.cookie",
              "req.body.password",
              "req.body.newPassword",
              "req.body.refreshToken",
              "req.body.token",
              "req.body.accessToken",
              "req.body.code",
              "req.body.email",
              "req.body.body",
              "req.body.message",
              "req.body.text",
              "req.body.reason",
              "req.body.phone",
              "req.body.apiKey",
              "req.body.smtpPass",
              "req.body.webhookSecret",
            ],
            remove: true,
          },
          transport:
            config.get<string>("app.nodeEnv") === "development"
              ? { target: "pino-pretty", options: { singleLine: true } }
              : undefined,
          autoLogging: {
            ignore: (req) =>
              req.url === "/api/health" ||
              req.url === "/api/health/live" ||
              req.url === "/api/health/ready" ||
              req.url === "/api/health/deploy-info" ||
              req.url === "/api/analytics/events" ||
              req.url === "/api/analytics/presence",
          },
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>("security.throttleTtlMs") ?? 60_000,
          limit: config.get<number>("security.throttleLimit") ?? 120,
        },
      ],
    }),
    PrismaModule,
    RegistrationEmailDomainsModule,
    AccessBlockModule,
    CryptoModule,
    AuditModule,
    MailModule,
    RedisModule,
    QueuesModule,
    EventsModule,
    HealthModule,
    AuthModule,
    UsersModule,
    AdminModule,
    CatalogModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
    RefundsModule,
    StorefrontModule,
    SmsModule,
    TelegramModule,
    ContactSettingsModule,
    CustomerMessagesModule,
    EmailAdminModule,
    NotificationsModule,
    TicketsModule,
    ChatModule,
    ContentModule,
    AnalyticsModule,
    WalletModule,
    AccountModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AccessBlockGuard,
    },
  ],
})
export class AppModule {}
