import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../shared/redis/redis.service";
import { AccessBlockService } from "../../shared/security/access-block.service";

const HELMET_PROTECTIONS = [
  "HSTS",
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Referrer-Policy",
];

export type SecurityOverview = {
  rateLimit: {
    enabled: true;
    limit: number;
    ttlMs: number;
    storage: "memory";
    redisReachable: boolean;
    routes: Array<{ label: string; limit: number; windowSec: number }>;
  };
  recaptcha: { configured: false; enabled: false };
  cloudflare: { enabled: false; trustProxyHops: number };
  helmet: { enabled: true; protections: string[] };
  audit: { enabled: true; total: number; last24h: number };
  activity: { last24h: number; sampleRate: number };
  accessBlocks: { total: number; ip: number; country: number };
  plaintextCodes: { documents: number; inventory: number; orders: number; reseller: number };
  recommendation: string;
  recentAudit: Array<{ id: string; action: string; actor: string; createdAt: string }>;
  recentActivity: Array<{ id: string; name: string; path: string; createdAt: string }>;
};

@Injectable()
export class AdminSecurityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly accessBlocks: AccessBlockService,
  ) {}

  async overview(): Promise<SecurityOverview> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const ttlMs = this.config.get<number>("security.throttleTtlMs") ?? 60_000;
    const limit = this.config.get<number>("security.throttleLimit") ?? 120;

    const [auditTotal, audit24h, activity24h, inventory, deliveries, recentAudit, recentActivity, redisReachable, accessBlocks] =
      await Promise.all([
        this.prisma.auditEvent.count(),
        this.prisma.auditEvent.count({ where: { createdAt: { gte: since } } }),
        this.prisma.analyticsEvent.count({ where: { createdAt: { gte: since } } }),
        this.prisma.inventoryItem.count(),
        this.prisma.orderDelivery.count(),
        this.prisma.auditEvent.findMany({
          orderBy: { createdAt: "desc" },
          take: 8,
          include: { user: { select: { email: true } } },
        }),
        this.prisma.analyticsEvent.findMany({
          orderBy: { createdAt: "desc" },
          take: 8,
          select: { id: true, name: true, path: true, createdAt: true },
        }),
        this.redis.ping().catch(() => false),
        this.accessBlocks.counts(),
      ]);

    return {
      rateLimit: {
        enabled: true,
        limit,
        ttlMs,
        storage: "memory",
        redisReachable,
        routes: [
          { label: "Global API", limit, windowSec: Math.round(ttlMs / 1000) },
          { label: "Login", limit: 10, windowSec: 60 },
          { label: "Register", limit: 5, windowSec: 60 },
          { label: "Checkout", limit: 10, windowSec: 60 },
        ],
      },
      recaptcha: { configured: false, enabled: false },
      cloudflare: { enabled: false, trustProxyHops: 1 },
      helmet: { enabled: true, protections: HELMET_PROTECTIONS },
      audit: { enabled: true, total: auditTotal, last24h: audit24h },
      activity: { last24h: activity24h, sampleRate: 1 },
      accessBlocks,
      plaintextCodes: { documents: 0, inventory, orders: deliveries, reseller: 0 },
      recommendation: redisReachable
        ? "Redis is reachable for checkout. Rate limits stay in process memory on this API."
        : "Redis is not reachable. Checkout needs Redis, and rate limits stay in process memory.",
      recentAudit: recentAudit.map((row) => ({
        id: row.id,
        action: row.action,
        actor: row.user?.email || "system",
        createdAt: row.createdAt.toISOString(),
      })),
      recentActivity: recentActivity.map((row) => ({
        id: row.id,
        name: row.name,
        path: row.path || "—",
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
}
