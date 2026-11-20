import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { TelegramModule } from "../telegram/telegram.module";
import { TicketsController } from "./tickets.controller";
import { TicketsService } from "./tickets.service";

@Module({
  imports: [NotificationsModule, TelegramModule],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
