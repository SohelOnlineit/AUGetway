import { INestApplication, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import type { ServerOptions } from "socket.io";

/**
 * Redis-backed Socket.IO adapter so multiple API instances can share rooms.
 * Falls back to in-memory adapter if Redis pub/sub setup fails at boot.
 * Enforces configured CORS allowlist across all Socket.IO namespaces.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly adapterLogger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;

  constructor(
    app: INestApplication,
    private readonly config: ConfigService,
  ) {
    super(app);
  }

  async connectToRedis() {
    const host = this.config.get<string>("redis.host") ?? "127.0.0.1";
    const port = this.config.get<number>("redis.port") ?? 6379;
    const password = this.config.get<string>("redis.password") || undefined;
    const db = this.config.get<number>("redis.db") ?? 0;

    try {
      const pubClient = new Redis({ host, port, password, db, lazyConnect: true });
      const subClient = pubClient.duplicate();
      await Promise.all([pubClient.connect(), subClient.connect()]);
      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.adapterLogger.log("Socket.IO Redis adapter connected");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.adapterLogger.warn(
        `Socket.IO Redis adapter unavailable (${message}); using in-memory adapter`,
      );
      this.adapterConstructor = null;
    }
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const corsOrigin =
      this.config.get<string>("app.corsOrigin") ?? "http://localhost:3000";
    const origins = corsOrigin
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const cors = {
      origin: origins,
      credentials: true,
    };

    const server = super.createIOServer(port, {
      ...options,
      cors,
    });
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
