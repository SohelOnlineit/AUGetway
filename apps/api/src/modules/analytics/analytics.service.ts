import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type {
  AdminAnalyticsLive,
  AdminAnalyticsSummary,
  AnalyticsEventNamePublic,
} from "@amarpin/types";
import { createHash } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../shared/redis/redis.service";

const LIVE_KEY = "analytics:live";
const LIVE_WINDOW_MS = 45_000;

const ALLOWED = new Set<AnalyticsEventNamePublic>([
  "page_view",
  "product_view",
  "add_to_cart",
  "checkout_start",
  "search",
]);

const EMPTY_TOTALS: Record<AnalyticsEventNamePublic, number> = {
  page_view: 0,
  product_view: 0,
  add_to_cart: 0,
  checkout_start: 0,
  search: 0,
};

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly memoryPresence = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async record(input: {
    name: string;
    path?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    visitorKey?: string | null;
  }): Promise<{ accepted: true } | { accepted: false; reason: string }> {
    if (!ALLOWED.has(input.name as AnalyticsEventNamePublic)) {
      throw new BadRequestException("Unsupported analytics event");
    }

    const path = this.sanitizePath(input.path);
    const entityType = this.sanitizeToken(input.entityType, 32);
    const entityId = this.sanitizeToken(input.entityId, 64);
    const visitorKey = this.hashVisitor(input.visitorKey);

    try {
      await this.prisma.analyticsEvent.create({
        data: {
          name: input.name,
          path,
          entityType,
          entityId,
          visitorKey,
        },
      });
      return { accepted: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`analytics persist failed: ${message}`);
      return { accepted: false, reason: "persist_failed" };
    }
  }

  async touchPresence(visitorKey?: string | null): Promise<{ accepted: true }> {
    const hash = this.hashVisitor(visitorKey);
    if (!hash) return { accepted: true };
    const expiresAt = Date.now() + LIVE_WINDOW_MS;
    try {
      await this.redis.client.zadd(LIVE_KEY, expiresAt, hash);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`presence redis failed: ${message}`);
      this.memoryPresence.set(hash, expiresAt);
    }
    return { accepted: true };
  }

  async live(): Promise<AdminAnalyticsLive> {
    const now = Date.now();
    let online = 0;
    try {
      await this.redis.client.zremrangebyscore(LIVE_KEY, 0, now);
      online = await this.redis.client.zcard(LIVE_KEY);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`presence count failed: ${message}`);
      for (const [key, expiresAt] of this.memoryPresence) {
        if (expiresAt <= now) this.memoryPresence.delete(key);
      }
      online = this.memoryPresence.size;
    }
    return {
      online,
      windowSeconds: LIVE_WINDOW_MS / 1000,
      updatedAt: new Date(now).toISOString(),
    };
  }

  async summary(windowDays = 7): Promise<AdminAnalyticsSummary> {
    const days = Math.min(Math.max(windowDays, 1), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.analyticsEvent.groupBy({
      by: ["name"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });

    const totals = { ...EMPTY_TOTALS };
    for (const row of rows) {
      if (ALLOWED.has(row.name as AnalyticsEventNamePublic)) {
        totals[row.name as AnalyticsEventNamePublic] = row._count._all;
      }
    }

    const pathRows = await this.prisma.analyticsEvent.groupBy({
      by: ["path"],
      where: {
        createdAt: { gte: since },
        path: { not: null },
        name: "page_view",
      },
      _count: { _all: true },
      orderBy: { _count: { path: "desc" } },
      take: 10,
    });

    return {
      windowDays: days,
      totals,
      topPaths: pathRows
        .filter((row) => row.path)
        .map((row) => ({ path: row.path!, count: row._count._all })),
    };
  }

  private sanitizePath(raw?: string | null): string | null {
    if (!raw?.trim()) return null;
    try {
      // Strip origin + query + hash — path only.
      const url = new URL(raw, "https://example.invalid");
      const path = url.pathname || "/";
      if (path.length > 200) return path.slice(0, 200);
      // Block obvious private areas from analytics noise.
      if (
        path.startsWith("/admin") ||
        path.startsWith("/api") ||
        path.startsWith("/login")
      ) {
        return null;
      }
      return path;
    } catch {
      return null;
    }
  }

  private sanitizeToken(raw?: string | null, max = 64): string | null {
    if (!raw?.trim()) return null;
    const value = raw.trim().slice(0, max);
    // Reject values that look like emails/tokens.
    if (value.includes("@") || value.includes(" ")) return null;
    return value;
  }

  private hashVisitor(raw?: string | null): string | null {
    if (!raw?.trim()) return null;
    return createHash("sha256")
      .update(raw.trim())
      .digest("hex")
      .slice(0, 32);
  }
}
