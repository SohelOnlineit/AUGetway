import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { json, urlencoded } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.use(json({ limit: "3mb" }));
  app.use(urlencoded({ extended: true, limit: "3mb" }));
  const config = app.get(ConfigService);

  app.setGlobalPrefix("api");
  app.use(helmet({ contentSecurityPolicy: false }));

  const origin = config.get<string>("WEB_ORIGIN") ?? "http://127.0.0.1:3100";
  app.enableCors({
    origin: origin.split(",").map((value) => value.trim()),
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

  const port = Number(config.get("PORT") ?? 4100);
  await app.listen(port, "127.0.0.1");
  Logger.log(`UniqBD Pay API on http://127.0.0.1:${port}/api`, "Bootstrap");
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
