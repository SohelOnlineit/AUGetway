import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AdminHomepageSection,
  AdminHomepageSlide,
  AdminNavigationItem,
  AdminSitePage,
  PublicSitePage,
  SitePageKeyPublic,
} from "@amarpin/types";
import {
  HomepageSectionType,
  SitePageKey,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../shared/audit/audit.service";
import { blankText, cleanSeoImage } from "../../shared/seo-input";
import {
  HomepageSectionTypeDto,
  type UpsertHomepageSectionDto,
  type UpsertHomepageSlideDto,
  type UpsertNavigationItemDto,
  type UpsertSitePageDto,
} from "./dto/cms.dto";

const PAGE_ROUTE: Record<SitePageKey, string> = {
  ABOUT: "/about",
  CONTACT: "/contact",
  PRIVACY: "/privacy-policy",
  TERMS: "/terms-conditions",
  REFUND_POLICY: "/refund-and-returns-policy",
  DISCLAIMERS: "/disclaimers",
};

@Injectable()
export class CmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // —— Homepage slides ——

  async listSlidesAdmin(): Promise<AdminHomepageSlide[]> {
    const rows = await this.prisma.homepageSlide.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((row) => this.mapSlide(row));
  }

  async createSlide(actorUserId: string, dto: UpsertHomepageSlideDto) {
    this.assertImageUrl(dto.imageUrl);
    this.assertOptionalHref(dto.linkUrl);
    const row = await this.prisma.homepageSlide.create({
      data: {
        title: dto.title.trim(),
        subtitle: dto.subtitle?.trim() || null,
        imageUrl: dto.imageUrl.trim(),
        linkUrl: dto.linkUrl?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit.record({
      action: "admin.cms.slide_created",
      userId: actorUserId,
      entityType: "homepage_slide",
      entityId: row.id,
    });
    return this.mapSlide(row);
  }

  async updateSlide(
    actorUserId: string,
    id: string,
    dto: UpsertHomepageSlideDto,
  ) {
    await this.requireSlide(id);
    this.assertImageUrl(dto.imageUrl);
    this.assertOptionalHref(dto.linkUrl);
    const row = await this.prisma.homepageSlide.update({
      where: { id },
      data: {
        title: dto.title.trim(),
        subtitle: dto.subtitle?.trim() || null,
        imageUrl: dto.imageUrl.trim(),
        linkUrl: dto.linkUrl?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit.record({
      action: "admin.cms.slide_updated",
      userId: actorUserId,
      entityType: "homepage_slide",
      entityId: row.id,
    });
    return this.mapSlide(row);
  }

  async deleteSlide(actorUserId: string, id: string) {
    await this.requireSlide(id);
    await this.prisma.homepageSlide.delete({ where: { id } });
    await this.audit.record({
      action: "admin.cms.slide_deleted",
      userId: actorUserId,
      entityType: "homepage_slide",
      entityId: id,
    });
    return { ok: true };
  }

  // —— Homepage sections ——

  async listSectionsAdmin(): Promise<AdminHomepageSection[]> {
    const rows = await this.prisma.homepageSection.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { category: { select: { name: true } } },
    });
    return rows.map((row) => this.mapSection(row));
  }

  async createSection(actorUserId: string, dto: UpsertHomepageSectionDto) {
    await this.validateSection(dto);
    const row = await this.prisma.homepageSection.create({
      data: {
        title: dto.title.trim(),
        type: dto.type as HomepageSectionType,
        categoryId: dto.categoryId || null,
        productLimit: dto.productLimit ?? 8,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
      include: { category: { select: { name: true } } },
    });
    await this.audit.record({
      action: "admin.cms.section_created",
      userId: actorUserId,
      entityType: "homepage_section",
      entityId: row.id,
    });
    return this.mapSection(row);
  }

  async updateSection(
    actorUserId: string,
    id: string,
    dto: UpsertHomepageSectionDto,
  ) {
    const existing = await this.prisma.homepageSection.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Section not found");
    await this.validateSection(dto);
    const row = await this.prisma.homepageSection.update({
      where: { id },
      data: {
        title: dto.title.trim(),
        type: dto.type as HomepageSectionType,
        categoryId: dto.categoryId || null,
        productLimit: dto.productLimit ?? existing.productLimit,
        sortOrder: dto.sortOrder ?? existing.sortOrder,
        isActive: dto.isActive ?? existing.isActive,
      },
      include: { category: { select: { name: true } } },
    });
    await this.audit.record({
      action: "admin.cms.section_updated",
      userId: actorUserId,
      entityType: "homepage_section",
      entityId: row.id,
    });
    return this.mapSection(row);
  }

  async deleteSection(actorUserId: string, id: string) {
    const existing = await this.prisma.homepageSection.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Section not found");
    await this.prisma.homepageSection.delete({ where: { id } });
    await this.audit.record({
      action: "admin.cms.section_deleted",
      userId: actorUserId,
      entityType: "homepage_section",
      entityId: id,
    });
    return { ok: true };
  }

  // —— Navigation ——

  async listNavAdmin(): Promise<AdminNavigationItem[]> {
    const rows = await this.prisma.navigationItem.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((row) => this.mapNav(row));
  }

  async createNav(actorUserId: string, dto: UpsertNavigationItemDto) {
    this.assertHref(dto.href);
    const row = await this.prisma.navigationItem.create({
      data: {
        label: dto.label.trim(),
        href: dto.href.trim(),
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit.record({
      action: "admin.cms.nav_created",
      userId: actorUserId,
      entityType: "navigation_item",
      entityId: row.id,
    });
    return this.mapNav(row);
  }

  async updateNav(
    actorUserId: string,
    id: string,
    dto: UpsertNavigationItemDto,
  ) {
    const existing = await this.prisma.navigationItem.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Navigation item not found");
    this.assertHref(dto.href);
    const row = await this.prisma.navigationItem.update({
      where: { id },
      data: {
        label: dto.label.trim(),
        href: dto.href.trim(),
        sortOrder: dto.sortOrder ?? existing.sortOrder,
        isActive: dto.isActive ?? existing.isActive,
      },
    });
    await this.audit.record({
      action: "admin.cms.nav_updated",
      userId: actorUserId,
      entityType: "navigation_item",
      entityId: row.id,
    });
    return this.mapNav(row);
  }

  async deleteNav(actorUserId: string, id: string) {
    const existing = await this.prisma.navigationItem.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Navigation item not found");
    await this.prisma.navigationItem.delete({ where: { id } });
    await this.audit.record({
      action: "admin.cms.nav_deleted",
      userId: actorUserId,
      entityType: "navigation_item",
      entityId: id,
    });
    return { ok: true };
  }

  // —— Site pages ——

  async listPagesAdmin(): Promise<AdminSitePage[]> {
    await this.ensureDefaultPages();
    const rows = await this.prisma.sitePage.findMany({
      orderBy: { key: "asc" },
    });
    return rows.map((row) => this.mapAdminPage(row));
  }

  async updatePage(
    actorUserId: string,
    key: SitePageKey,
    dto: UpsertSitePageDto,
  ): Promise<AdminSitePage> {
    await this.ensureDefaultPages();
    const row = await this.prisma.sitePage.update({
      where: { key },
      data: {
        title: dto.title.trim(),
        body: dto.body,
        ...(dto.seoTitle !== undefined ? { seoTitle: blankText(dto.seoTitle) } : {}),
        ...(dto.seoDescription !== undefined ? { seoDescription: blankText(dto.seoDescription) } : {}),
        ...(dto.seoImageUrl !== undefined ? { seoImageUrl: cleanSeoImage(dto.seoImageUrl) } : {}),
        ...(dto.noindex !== undefined ? { noindex: dto.noindex } : {}),
        isPublished: dto.isPublished ?? false,
      },
    });
    await this.audit.record({
      action: "admin.cms.page_updated",
      userId: actorUserId,
      entityType: "site_page",
      entityId: row.id,
      metadata: { key: row.key, isPublished: row.isPublished },
    });
    return this.mapAdminPage(row);
  }

  async getPublicPage(key: SitePageKey): Promise<PublicSitePage> {
    const row = await this.prisma.sitePage.findUnique({ where: { key } });
    if (!row || !row.isPublished) {
      throw new NotFoundException("Page not found");
    }
    return {
      key: row.key as SitePageKeyPublic,
      title: row.title,
      body: row.body,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      seoImageUrl: row.seoImageUrl,
      noindex: row.noindex,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listSitemapPages(): Promise<{ path: string; updatedAt: Date }[]> {
    const rows = await this.prisma.sitePage.findMany({
      where: { isPublished: true, noindex: false },
      select: { key: true, updatedAt: true },
    });
    return rows.map((row) => ({
      path: PAGE_ROUTE[row.key],
      updatedAt: row.updatedAt,
    }));
  }

  private async ensureDefaultPages() {
    const defaults: Array<{ key: SitePageKey; title: string }> = [
      { key: SitePageKey.ABOUT, title: "About AuGetway" },
      { key: SitePageKey.CONTACT, title: "Contact" },
      { key: SitePageKey.PRIVACY, title: "Privacy Policy" },
      { key: SitePageKey.TERMS, title: "Terms & Conditions" },
      { key: SitePageKey.REFUND_POLICY, title: "Refund & Returns Policy" },
      { key: SitePageKey.DISCLAIMERS, title: "Disclaimers" },
    ];
    for (const item of defaults) {
      await this.prisma.sitePage.upsert({
        where: { key: item.key },
        create: { key: item.key, title: item.title, body: "", isPublished: false },
        update: {},
      });
    }
  }

  private async validateSection(dto: UpsertHomepageSectionDto) {
    if (dto.type === HomepageSectionTypeDto.CATEGORY_PRODUCTS) {
      if (!dto.categoryId) {
        throw new BadRequestException(
          "categoryId is required for CATEGORY_PRODUCTS",
        );
      }
      const cat = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!cat) throw new BadRequestException("Invalid categoryId");
    }
  }

  private assertImageUrl(url: string) {
    const trimmed = url.trim();
    const sitePath =
      trimmed.startsWith("/") &&
      !trimmed.startsWith("//") &&
      !trimmed.includes("\\") &&
      !trimmed.includes("..");
    if (
      !sitePath &&
      !trimmed.startsWith("https://") &&
      !trimmed.startsWith("http://")
    ) {
      throw new BadRequestException(
        "imageUrl must be a site path or an absolute http(s) URL",
      );
    }
  }

  private assertHref(href: string) {
    const trimmed = href.trim();
    if (!trimmed.startsWith("/") && !trimmed.startsWith("https://")) {
      throw new BadRequestException("href must start with / or https://");
    }
  }

  private assertOptionalHref(href?: string | null) {
    if (href == null || href === "") return;
    this.assertHref(href);
  }

  private async requireSlide(id: string) {
    const row = await this.prisma.homepageSlide.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Slide not found");
    return row;
  }

  private mapSlide(row: {
    id: string;
    title: string;
    subtitle: string | null;
    imageUrl: string;
    linkUrl: string | null;
    sortOrder: number;
    isActive: boolean;
    updatedAt: Date;
  }): AdminHomepageSlide {
    return {
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      imageUrl: row.imageUrl,
      linkUrl: row.linkUrl,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapSection(row: {
    id: string;
    title: string;
    type: HomepageSectionType;
    categoryId: string | null;
    productLimit: number;
    sortOrder: number;
    isActive: boolean;
    updatedAt: Date;
    category: { name: string } | null;
  }): AdminHomepageSection {
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      categoryId: row.categoryId,
      categoryName: row.category?.name ?? null,
      productLimit: row.productLimit,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapNav(row: {
    id: string;
    label: string;
    href: string;
    sortOrder: number;
    isActive: boolean;
    updatedAt: Date;
  }): AdminNavigationItem {
    return {
      id: row.id,
      label: row.label,
      href: row.href,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapAdminPage(row: {
    key: SitePageKey;
    title: string;
    body: string;
    seoTitle: string | null;
    seoDescription: string | null;
    seoImageUrl: string | null;
    noindex: boolean;
    isPublished: boolean;
    updatedAt: Date;
  }): AdminSitePage {
    return {
      key: row.key as SitePageKeyPublic,
      title: row.title,
      body: row.body,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      seoImageUrl: row.seoImageUrl,
      noindex: row.noindex,
      isPublished: row.isPublished,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
