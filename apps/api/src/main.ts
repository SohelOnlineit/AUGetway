import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { Logger as PinoLogger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { RedisIoAdapter } from "./shared/ws/redis-io.adapter";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  // Trust 1 hop reverse proxy (Nginx) so req.ip correctly resolves client addresses for rate limiting and audits
  app.set("trust proxy", 1);

  // Image uploads travel as base64 JSON. 10 MB of image data is about 14 MB of JSON.
  // Only the upload routes may be that large; everything else is capped at 1 MB
  // before the body is buffered, so a big request cannot tie up memory.
  const UPLOAD_ROUTE = /^\/api\/(?:admin\/uploads\/images|chat\/rooms\/[^/]+\/images|account\/profile\/photo)\/?$/;
  const SMALL_BODY_BYTES = 1024 * 1024;
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!["POST", "PUT", "PATCH"].includes(req.method) || UPLOAD_ROUTE.test(req.path)) {
      next();
      return;
    }
    if (Number(req.headers["content-length"] ?? 0) > SMALL_BODY_BYTES) {
      res.status(413).json({ statusCode: 413, message: "Payload too large" });
      return;
    }
    let received = 0;
    req.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (received > SMALL_BODY_BYTES) req.destroy();
    });
    next();
  });
  app.useBodyParser("json", { limit: "16mb" });
  app.useBodyParser("urlencoded", { limit: "16mb", extended: true });

  const config = app.get(ConfigService);
  const logger = app.get(PinoLogger);
  app.useLogger(logger);

  app.setGlobalPrefix("api");
  app.use(
    helmet({
      // The API only returns JSON and images, never pages, so nothing needs to load or frame.
      contentSecurityPolicy: {
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: "cross-origin" },
      strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true },
    }),
  );

  const corsOrigin = config.get<string>("app.corsOrigin") ?? "http://localhost:3000";
  const origins = [
    ...new Set(
      [
        ...corsOrigin.split(","),
        "https://pay.uniqbd.com",
        "https://www.pay.uniqbd.com",
        "https://amarpin.com",
        "https://www.amarpin.com",
        "https://uniqbd.com",
        "https://www.uniqbd.com",
      ]
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  app.enableCors({
    origin: origins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const redisIoAdapter = new RedisIoAdapter(app, config);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  const port = config.get<number>("app.port") ?? 4000;
  const host = config.get<string>("app.host") ?? "0.0.0.0";
  await app.listen(port, host);

  Logger.log(`API listening on http://${host}:${port}/api`, "Bootstrap");
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
