import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { BackupController } from "./backup.controller";
import { BackupService } from "./backup.service";
import { DeskGuard } from "./desk.guard";
import { DomainsController } from "./domains.controller";
import { SiteDomainService } from "./site-domain.service";
import { PrismaService } from "./prisma.service";
import { PayController } from "./pay.controller";
import { PayService } from "./pay.service";
import { PaymentSecurityService } from "./payment-security.service";
import { RateLimitGuard } from "./rate-limit";
import { TurnstileController } from "./turnstile.controller";
import { TurnstileService } from "./turnstile.service";
import { TwoFactorController } from "./two-factor.controller";
import { TwoFactorService } from "./two-factor.service";

const devSecret = "dev-only-secret-change-me-32-characters";

// Read after ConfigModule.forRoot() has loaded the .env file.
function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === "production" && (!secret || secret.length < 32 || secret === devSecret)) {
    // A missing or default secret would let anyone forge a sign-in token.
    throw new Error("JWT_SECRET must be set to a random value of at least 32 characters in production");
  }
  return secret ?? devSecret;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env", ".env"],
    }),
    JwtModule.register({
      global: true,
      secret: jwtSecret(),
      // The desk website signs in for 7 days. Only the phone app asks for a longer token (see PayService.login).
      signOptions: { expiresIn: "7d", algorithm: "HS256" },
      verifyOptions: { algorithms: ["HS256"] },
    }),
  ],
  controllers: [PayController, BackupController, TurnstileController, TwoFactorController, DomainsController],
  providers: [
    PrismaService,
    PayService,
    TwoFactorService,
    SiteDomainService,
    PaymentSecurityService,
    BackupService,
    TurnstileService,
    DeskGuard,
    // Runs before every route guard, so a flood is turned away before it reaches the database.
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
