import * as Joi from "joi";

/** The sample values from `.env.example` must never reach production. */
const PLACEHOLDER_SECRET = /replace-me|changeme|change-me|phase0-dev|example|your[-_]?secret/i;

/**
 * 32+ characters everywhere. In production the secret must also not be a known
 * placeholder, and the access and refresh secrets must differ.
 */
function productionSecret() {
  return Joi.string()
    .min(32)
    .required()
    .when("NODE_ENV", {
      is: "production",
      then: Joi.string().pattern(PLACEHOLDER_SECRET, { invert: true }).messages({
        "string.pattern.invert.base":
          "must be a real random secret in production, not a placeholder from .env.example",
      }),
    });
}

/**
 * Environment contract (Phase 0 + Identity).
 * Values are placeholders only — never commit real secrets.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "test", "production")
    .default("development"),
  PORT: Joi.number().port().default(4000),
  /** Production systemd sets 127.0.0.1. Local dev stays on every interface. */
  HOST: Joi.string().default("0.0.0.0"),
  LOG_LEVEL: Joi.string()
    .valid("fatal", "error", "warn", "info", "debug", "trace", "silent")
    .default("info"),
  CORS_ORIGIN: Joi.string().default("http://localhost:3000"),
  API_PUBLIC_URL: Joi.string().uri().default("http://localhost:4000/api"),
  APP_PUBLIC_URL: Joi.string().uri().default("http://localhost:3000"),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ["postgres", "postgresql"] })
    .required(),

  REDIS_HOST: Joi.string().hostname().default("127.0.0.1"),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow("").default(""),
  REDIS_DB: Joi.number().integer().min(0).default(0),
  REDIS_KEY_PREFIX: Joi.string().default("amarpin:"),

  JWT_ACCESS_SECRET: productionSecret(),
  JWT_REFRESH_SECRET: productionSecret().invalid(Joi.ref("JWT_ACCESS_SECRET")),
  DATA_ENCRYPTION_KEY: productionSecret(),

  THROTTLE_TTL_MS: Joi.number().integer().min(1000).default(60_000),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(120),

  UPLOADS_DIR: Joi.string().default("../../uploads"),

  /** `dev` only allowed outside production (enforced in MailModule). */
  MAIL_PROVIDER: Joi.string().valid("dev", "noop").default("noop"),

  /**
   * Sandbox/mock payments.
   * Non-production default: true. Production default: false.
   * PAYMENT_SANDBOX_ENABLED=true is rejected outright in production.
   */
  PAYMENT_SANDBOX_ENABLED: Joi.when("NODE_ENV", {
    is: "production",
    then: Joi.string().valid("false").default("false"),
    otherwise: Joi.string().valid("true", "false").default("true"),
  }),

  /** Optional seed inputs — never hardcode credentials in source. */
  ADMIN_SEED_EMAIL: Joi.string().email().optional(),
  ADMIN_SEED_PASSWORD: Joi.string().min(10).optional(),
  DEV_SEED_CUSTOMER_EMAIL: Joi.string().email().optional(),
  DEV_SEED_CUSTOMER_PASSWORD: Joi.string().min(10).optional(),
  ALLOW_ADMIN_SEED: Joi.string().valid("true", "false").optional(),
});
