import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ContentModule } from "../content/content.module";
import { StorefrontModule } from "../storefront/storefront.module";
import { TelegramModule } from "../telegram/telegram.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { UsersModule } from "../users/users.module";
import { RedisModule } from "../../shared/redis/redis.module";
import { ChatAccessGuard } from "./chat-access.guard";
import { ChatController } from "./chat.controller";
import { ChatGateway } from "./chat.gateway";
import { ChatPhotoRetentionService } from "./chat-photo-retention.service";
import { ChatPresenceRegistry } from "./chat-presence";
import { ChatService } from "./chat.service";

@Module({
  imports: [AuthModule, UsersModule, NotificationsModule, RedisModule, ContentModule, StorefrontModule, TelegramModule],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, ChatPresenceRegistry, ChatPhotoRetentionService, ChatAccessGuard],
  exports: [ChatService],
})
export class ChatModule {}
