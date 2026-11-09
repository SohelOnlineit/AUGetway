import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { DeskGuard } from "./desk.guard";
import { PrismaService } from "./prisma.service";
import { PayController } from "./pay.controller";
import { PayService } from "./pay.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env", ".env"],
    }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? "dev-only-secret-change-me-32-characters",
      signOptions: { expiresIn: "12h" },
    }),
  ],
  controllers: [PayController],
  providers: [PrismaService, PayService, DeskGuard],
})
export class AppModule {}
