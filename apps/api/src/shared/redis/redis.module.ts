import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { REDIS_CLIENT } from "./redis.constants";
import { RedisService } from "./redis.service";

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get<string>("redis.host") ?? "127.0.0.1";
        const port = config.get<number>("redis.port") ?? 6379;
        const password = config.get<string>("redis.password");
        const db = config.get<number>("redis.db") ?? 0;
        const keyPrefix = config.get<string>("redis.keyPrefix") ?? "Amarpin:";

        return new Redis({
          host,
          port,
          password: password || undefined,
          db,
          keyPrefix,
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
          lazyConnect: false,
        });
      },
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
