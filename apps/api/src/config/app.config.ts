import { registerAs } from "@nestjs/config";

export const appConfig = registerAs("app", () => ({
  nodeEnv: process.env.NODE_ENV ?? "development",
  host: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 4000),
  logLevel: process.env.LOG_LEVEL ?? "info",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  apiPublicUrl: process.env.API_PUBLIC_URL ?? "http://localhost:4000/api",
  appPublicUrl: process.env.APP_PUBLIC_URL ?? "http://localhost:3000",
  uploadsDir: process.env.UPLOADS_DIR ?? "../../uploads",
}));

export const databaseConfig = registerAs("database", () => ({
  url: process.env.DATABASE_URL,
}));

export const redisConfig = registerAs("redis", () => ({
  host: process.env.REDIS_HOST ?? "127.0.0.1",
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  db: Number(process.env.REDIS_DB ?? 0),
  keyPrefix: process.env.REDIS_KEY_PREFIX ?? "amarpin:",
}));

export const securityConfig = registerAs("security", () => ({
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  dataEncryptionKey: process.env.DATA_ENCRYPTION_KEY,
  throttleTtlMs: Number(process.env.THROTTLE_TTL_MS ?? 60_000),
  throttleLimit: Number(process.env.THROTTLE_LIMIT ?? 120),
}));

export const mailConfig = registerAs("mail", () => ({
  /** `dev` (local only) | `noop` (default until a real provider is wired). */
  provider: process.env.MAIL_PROVIDER ?? "noop",
}));

export const paymentsConfig = registerAs("payments", () => {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const raw = (process.env.PAYMENT_SANDBOX_ENABLED ?? "true").toLowerCase();
  const requested = raw === "true" || raw === "1";
  // Impossible to enable sandbox in production regardless of env value.
  const sandboxEnabled = nodeEnv === "production" ? false : requested;
  return { sandboxEnabled };
});
