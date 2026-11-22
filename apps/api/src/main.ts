import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { json, urlencoded, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { needsPictureBody, pictureBodyLimit, smallBodyLimit } from "./body-limit";
import { describeRequest, pickHostHeader, runWithRequest } from "./request-context";
import { SiteDomainService } from "./site-domain.service";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  // nginx is the only thing in front of this process. Trust exactly that one hop, so the visitor's
  // address comes from nginx and a forged X-Forwarded-For from the visitor is ignored.
  app.set("trust proxy", 1);
  // Remember which website address this request came in on (pay.uniqbd.com, pay.amarpin.com, api.pay.amarpin.com),
  // so the brand and the payment links in the answer are those of that address. nginx sends the real Host header.
  app.use((request: Request, _response: Response, next: NextFunction) => {
    const address = pickHostHeader(request.headers.host, request.headers["x-forwarded-host"]);
    runWithRequest(describeRequest(address, request.protocol), next);
  });
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

  // The website calls the API on its own address, so CORS is only a safety net for a page on another address.
  // It lets in the origins in WEB_ORIGIN and every website address added on the Domains page.
  const listed = (config.get<string>("WEB_ORIGIN") ?? "http://127.0.0.1:3100").split(",").map((value) => value.trim().replace(/\/+$/, ""));
  const domains = app.get(SiteDomainService);
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin || listed.includes(origin)) return callback(null, true);
      domains.allowsOrigin(origin).then((allowed) => callback(null, allowed), () => callback(null, false));
    },
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
