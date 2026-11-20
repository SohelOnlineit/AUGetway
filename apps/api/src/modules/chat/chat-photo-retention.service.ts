import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { UploadsService } from "../content/uploads.service";

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const BATCH = 200;

function threeMonthsAgo(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - 3);
  return cutoff;
}

@Injectable()
export class ChatPhotoRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatPhotoRetentionService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  onModuleInit() {
    void this.purgeExpiredPhotos();
    this.timer = setInterval(() => {
      void this.purgeExpiredPhotos();
    }, CHECK_EVERY_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async purgeExpiredPhotos() {
    if (this.running) return;
    this.running = true;
    try {
      let removed = 0;
      for (let pass = 0; pass < 20; pass += 1) {
        const count = await this.purgeBatch();
        removed += count;
        if (count < BATCH) break;
      }
      if (removed > 0) {
        this.logger.log(`Removed ${removed} chat photo${removed === 1 ? "" : "s"} older than 3 months`);
      }
    } catch (error) {
      this.logger.error(`Chat photo cleanup failed: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally {
      this.running = false;
    }
  }

  private async purgeBatch() {
    const cutoff = threeMonthsAgo();
    const expired = await this.prisma.chatMessage.findMany({
      where: { imageUrl: { not: null }, createdAt: { lt: cutoff } },
      select: { id: true, imageUrl: true, body: true },
      orderBy: { createdAt: "asc" },
      take: BATCH,
    });
    if (expired.length === 0) return 0;

    const paths = [...new Set(expired.map((row) => row.imageUrl).filter((path): path is string => Boolean(path)))];
    const keepFile = new Set<string>();
    for (const path of paths) {
      const newerChat = await this.prisma.chatMessage.count({
        where: { imageUrl: path, createdAt: { gte: cutoff } },
      });
      if (newerChat > 0 || (await this.usedOutsideChat(path))) keepFile.add(path);
    }

    const cleared = new Set<string>();
    for (const path of paths) {
      if (keepFile.has(path)) {
        cleared.add(path);
        continue;
      }
      try {
        await this.uploads.deleteChatPhoto(path);
        cleared.add(path);
      } catch (error) {
        this.logger.warn(`Could not delete ${path}: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }

    const ready = expired.filter((row) => row.imageUrl && cleared.has(row.imageUrl));
    const withCaption = ready.filter((row) => row.body.trim()).map((row) => row.id);
    const photoOnly = ready.filter((row) => !row.body.trim());
    if (withCaption.length > 0) {
      await this.prisma.chatMessage.updateMany({
        where: { id: { in: withCaption } },
        data: { imageUrl: null },
      });
    }
    for (const row of photoOnly) {
      await this.prisma.chatMessage.update({
        where: { id: row.id },
        data: { imageUrl: null, body: "Photo expired" },
      });
    }
    return ready.length;
  }

  private async usedOutsideChat(path: string) {
    const [
      productImage,
      productSeo,
      shopSeo,
      slide,
      category,
      brand,
      routeSeo,
      blog,
      blogCategory,
      page,
    ] = await Promise.all([
      this.prisma.productImage.findFirst({ where: { url: path }, select: { id: true } }),
      this.prisma.product.findFirst({ where: { seoImageUrl: path }, select: { id: true } }),
      this.prisma.productSeo.findFirst({ where: { seoImageUrl: path }, select: { id: true } }),
      this.prisma.homepageSlide.findFirst({ where: { imageUrl: path }, select: { id: true } }),
      this.prisma.category.findFirst({
        where: { OR: [{ imageUrl: path }, { seoImageUrl: path }] },
        select: { id: true },
      }),
      this.prisma.brand.findFirst({
        where: { OR: [{ logoUrl: path }, { seoImageUrl: path }] },
        select: { id: true },
      }),
      this.prisma.routeSeo.findFirst({ where: { imageUrl: path }, select: { key: true } }),
      this.prisma.blogPost.findFirst({
        where: { OR: [{ coverImagePath: path }, { seoImageUrl: path }] },
        select: { id: true },
      }),
      this.prisma.blogCategory.findFirst({ where: { seoImageUrl: path }, select: { id: true } }),
      this.prisma.sitePage.findFirst({ where: { seoImageUrl: path }, select: { id: true } }),
    ]);
    return Boolean(
      productImage || productSeo || shopSeo || slide || category || brand || routeSeo || blog || blogCategory || page,
    );
  }
}
