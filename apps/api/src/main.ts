import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { json, urlencoded, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { needsPictureBody, pictureBodyLimit, smallBodyLimit } from "./body-limit";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  // nginx is the only thing in front of this process. Trust exactly that one hop, so the visitor's
  // address comes from nginx and a forged X-Forwarded-For from the visitor is ignored.
  app.set("trust proxy", 1);
  const smallJson = json({ limit: smallBodyLimit });
  const pictureJson = json({ limit: pictureBodyLimit });
  app.use((request: Request, response: Response, next: NextFunction) =>
    (needsPictureBody(request.method, request.path) ? pictureJson : smallJson)(request, response, next),
  );
  app.use(urlencoded({ extended: true, limit: "100kb" }));
  const config = app.get(ConfigService);

  app.setGlobalPrefix("api");
  // This API only returns JSON, so no page from it may load anything or be framed.
  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    }),
  );
  // Everything here is private or changes by the second. No browser or proxy should keep a copy.
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });

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
  Logger.log(`AU-Getway API on http://127.0.0.1:${port}/api`, "Bootstrap");
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
