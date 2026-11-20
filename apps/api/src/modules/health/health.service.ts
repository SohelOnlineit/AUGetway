import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import type { HealthStatus } from "@amarpin/types";
import { Queue } from "bullmq";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaService } from "../../prisma/prisma.service";
import { SYSTEM_QUEUE } from "../../queues/queue.constants";
import { MailService } from "../../shared/mail/mail.service";
import { RedisService } from "../../shared/redis/redis.service";
import { SandboxPaymentProvider } from "../payments/sandbox-payment.provider";

export interface DependencyHealth {
  status: HealthStatus;
  latencyMs?: number;
  error?: string;
  detail?: string;
}

export interface ReadyReport {
  status: HealthStatus;
  checkedAt: string;
  dependencies: {
    postgres: DependencyHealth;
    redis: DependencyHealth;
    bullmq: DependencyHealth;
    mail: DependencyHealth;
    payments: DependencyHealth;
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    @InjectQueue(SYSTEM_QUEUE) private readonly systemQueue: Queue,
  ) {}

  live() {
    return {
      status: "ok" as const,
      service: "AuGetway-api",
      checkedAt: new Date().toISOString(),
    };
  }

  deployInfo() {
    const nodeEnv = this.config.get<string>("app.nodeEnv") ?? "development";
    return {
      service: "AuGetway-api",
      nodeEnv,
      checkedAt: new Date().toISOString(),
      packageVersion: this.readPackageVersion(),
      paymentsSandboxEnabled:
        SandboxPaymentProvider.isSandboxRuntimeAllowed(this.config),
      mailProvider: this.config.get<string>("mail.provider") ?? "noop",
      note:
        "No secrets included. Configure external email/push/monitoring via env — see deploy/aapanel/INTEGRATIONS.md",
    };
  }

  async ready(): Promise<ReadyReport> {
    const [postgres, redis, bullmq, mail, payments] = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
      this.checkBullmq(),
      this.checkMail(),
      this.checkPayments(),
    ]);

    // Mail/payments may be intentionally noop — that is "ok" with detail, not fake success.
    const critical = [postgres.status, redis.status, bullmq.status];
    const status: HealthStatus = critical.every((s) => s === "ok")
      ? "ok"
      : critical.some((s) => s === "down")
        ? "down"
        : "degraded";

    return {
      status,
      checkedAt: new Date().toISOString(),
      dependencies: { postgres, redis, bullmq, mail, payments },
    };
  }

  private async checkPostgres(): Promise<DependencyHealth> {
    const started = Date.now();
    try {
      await this.prisma.ping();
      return { status: "ok", latencyMs: Date.now() - started };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`postgres health failed: ${message}`);
      return { status: "down", latencyMs: Date.now() - started, error: message };
    }
  }

  private async checkRedis(): Promise<DependencyHealth> {
    const started = Date.now();
    try {
      const ok = await this.redis.ping();
      return {
        status: ok ? "ok" : "down",
        latencyMs: Date.now() - started,
        error: ok ? undefined : "unexpected ping response",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`redis health failed: ${message}`);
      return { status: "down", latencyMs: Date.now() - started, error: message };
    }
  }

  private async checkBullmq(): Promise<DependencyHealth> {
    const started = Date.now();
    try {
      await this.systemQueue.waitUntilReady();
      return { status: "ok", latencyMs: Date.now() - started };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`bullmq health failed: ${message}`);
      return {
        status: "degraded",
        latencyMs: Date.now() - started,
        error: message,
      };
    }
  }

  private async checkMail(): Promise<DependencyHealth> {
    const started = Date.now();
    try {
      const report = await this.mail.readiness();
      return {
        status: "ok",
        latencyMs: Date.now() - started,
        detail: report.ready
          ? `provider=${report.provider}`
          : `provider=${report.provider}; ${report.message ?? "not configured for outbound delivery"}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: "degraded",
        latencyMs: Date.now() - started,
        error: message,
      };
    }
  }

  private checkPayments(): Promise<DependencyHealth> {
    const started = Date.now();
    const nodeEnv = this.config.get<string>("app.nodeEnv") ?? "development";
    const sandboxAllowed =
      SandboxPaymentProvider.isSandboxRuntimeAllowed(this.config);
    if (nodeEnv === "production" && sandboxAllowed) {
      return Promise.resolve({
        status: "degraded",
        latencyMs: Date.now() - started,
        error: "Sandbox payments must stay disabled in production",
      });
    }
    return Promise.resolve({
      status: "ok",
      latencyMs: Date.now() - started,
      detail: sandboxAllowed
        ? "sandbox enabled (non-production)"
        : "sandbox disabled; live provider not selected",
    });
  }

  private readPackageVersion(): string {
    try {
      const raw = readFileSync(join(process.cwd(), "package.json"), "utf8");
      const pkg = JSON.parse(raw) as { version?: string };
      return pkg.version ?? "0.0.0";
    } catch {
      return "unknown";
    }
  }
}
