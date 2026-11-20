import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "./redis.constants";

@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  get client(): Redis {
    return this.redis;
  }

  async ping(): Promise<boolean> {
    const result = await this.redis.ping();
    return result === "PONG";
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
