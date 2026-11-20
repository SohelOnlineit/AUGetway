import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SYSTEM_QUEUE } from "./queue.constants";
import { SystemProcessor } from "./system.processor";

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>("redis.host") ?? "127.0.0.1",
          port: config.get<number>("redis.port") ?? 6379,
          password: config.get<string>("redis.password") || undefined,
          db: config.get<number>("redis.db") ?? 0,
        },
        prefix: `${config.get<string>("redis.keyPrefix") ?? "amarpin:"}bull`,
      }),
    }),
    BullModule.registerQueue({ name: SYSTEM_QUEUE }),
  ],
  providers: [SystemProcessor],
  exports: [BullModule],
})
export class QueuesModule {}
