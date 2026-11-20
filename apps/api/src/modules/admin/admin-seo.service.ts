import { BadRequestException, Injectable } from "@nestjs/common";
import type { AdminAppearance, AdminRouteSeo, AdminSeoSettings, StorefrontBrand } from "@amarpin/types";
import { RouteSeoKey } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../shared/audit/audit.service";
import { blankText, canonicalOrigin, cleanCanonicalPath, cleanSeoImage, robotsPath } from "../../shared/seo-input";
import {
  cleanHandle,
  requireSameAs,
  cleanSuffix,
  cleanVerifications,
  emptySeoProfile,
  FIXED_ROUTE_SEO,
  parseRouteStore,
  parseSeoProfile,
  seoProfileKey,
  seoRoutesKey,
  type SeoProfile,
  type StoredRouteSeo,
} from "../../shared/seo-profile";
import type { UpdateAdminAppearanceDto } from "./dto/appearance.dto";
import { resolveStorefrontId, STOREFRONTS, type StorefrontId } from "../catalog/storefronts";
import type { UpdateAdminRouteSeoDto, UpdateAdminSeoSettingsDto } from "./dto/seo.dto";

const FIXED_ROUTES: Array<{ key: RouteSeoKey; path: string }> = FIXED_ROUTE_SEO.map((item) => ({
  key: item.key as RouteSeoKey,
  path: item.path,
}));

const MEDIA_PATH = /^\/api\/content\/media\/[a-f0-9]{32}\.(jpg|png|webp)$/;
const BUILTIN_LOGOS = new Set([
  "/logo/amarpin-logo-light.png",
  "/logo/amarpin-logo-dark.png",
  "/logo/uniqbd-logo-light.png",
  "/logo/uniqbd-logo-dark.png",
]);
const BRAND_IDS: StorefrontId[] = ["amarpin", "uniqbd"];

@Injectable()
export class AdminSeoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(shop?: string): Promise<AdminSeoSettings> {
    const id = resolveStorefrontId(shop);
    const profile = STOREFRONTS[id];
    const row = await this.prisma.siteContentSettings.upsert({
      where: { key: profile.key },
      create: {
        key: profile.key,
        siteName: profile.siteName,
        logoAlt: profile.siteName,
        canonicalBaseUrl: profile.canonicalBaseUrl,
      },
      update: {},
    });
    const extra = await this.readProfile(profile.key);
    return this.map(id, row, extra);
  }

  async update(
    actorUserId: string,
    dto: UpdateAdminSeoSettingsDto,
  ): Promise<AdminSeoSettings> {
    const id = resolveStorefrontId(dto.shop);
    const profile = STOREFRONTS[id];
    const siteName = dto.siteName.trim();
    if (siteName.length < 2) {
      throw new BadRequestException("siteName is required");
    }

    const canonical = canonicalOrigin(dto.canonicalBaseUrl);

    const robotsExtra = this.sanitizeRobotsExtra(dto.robotsExtra);
    const defaultOgImageUrl =
      dto.defaultOgImageUrl !== undefined ? cleanSeoImage(dto.defaultOgImageUrl) : undefined;
    const extra = this.profileFromDto(dto, await this.readProfile(profile.key));

    const row = await this.prisma.siteContentSettings.upsert({
      where: { key: profile.key },
      create: {
        key: profile.key,
        siteName,
        logoAlt: profile.siteName,
        tagline: dto.tagline?.trim() || null,
        defaultSeoTitle: dto.defaultSeoTitle?.trim() || null,
        defaultSeoDescription: dto.defaultSeoDescription?.trim() || null,
        canonicalBaseUrl: canonical ?? profile.canonicalBaseUrl,
        robotsExtra,
        defaultOgImageUrl: defaultOgImageUrl ?? null,
      },
      update: {
        siteName,
        tagline: dto.tagline?.trim() || null,
        defaultSeoTitle: dto.defaultSeoTitle?.trim() || null,
        defaultSeoDescription: dto.defaultSeoDescription?.trim() || null,
        canonicalBaseUrl: canonical,
        robotsExtra,
        ...(defaultOgImageUrl !== undefined ? { defaultOgImageUrl } : {}),
      },
    });
    await this.prisma.systemMeta.upsert({
      where: { key: seoProfileKey(profile.key) },
      create: { key: seoProfileKey(profile.key), value: JSON.stringify(extra) },
      update: { value: JSON.stringify(extra) },
    });

    await this.audit.record({
      action: "admin.seo.settings_updated",
      userId: actorUserId,
      entityType: "site_content_settings",
      entityId: row.id,
      metadata: { siteName: row.siteName, storefront: id, indexing: extra.indexing },
    });

    return this.map(id, row, extra);
  }

  async listRoutes(shop?: string): Promise<AdminRouteSeo[]> {
    const id = resolveStorefrontId(shop);
    const stored = await this.readRoutes(STOREFRONTS[id].key);
    if (stored) return this.routesFromStore(stored);
    if (id === "amarpin") return this.tableRoutes();
    return this.routesFromStore({});
  }

  async updateRoute(
    actorUserId: string,
    key: string,
    dto: UpdateAdminRouteSeoDto,
  ): Promise<AdminRouteSeo> {
    const id = resolveStorefrontId(dto.shop);
    const fixed = FIXED_ROUTES.find((item) => item.key === key);
    if (!fixed || dto.key !== key) {
      throw new BadRequestException("Unknown public route");
    }
    const current = await this.listRoutes(id);
    const updatedAt = new Date().toISOString();
    const next = current.map((route) =>
      route.key === fixed.key
        ? {
            ...route,
            title: blankText(dto.title),
            description: blankText(dto.description),
            imageUrl: cleanSeoImage(dto.imageUrl),
            canonicalPath: cleanCanonicalPath(dto.canonicalPath),
            noindex: dto.noindex ?? false,
            nofollow: dto.nofollow ?? false,
            updatedAt,
          }
        : route,
    );
    await this.writeRoutes(STOREFRONTS[id].key, next);
    if (id === "amarpin") {
      await this.ensureRoutes();
      await this.prisma.routeSeo.update({
        where: { key: fixed.key },
        data: {
          title: blankText(dto.title),
          description: blankText(dto.description),
          imageUrl: cleanSeoImage(dto.imageUrl),
          canonicalPath: cleanCanonicalPath(dto.canonicalPath),
          noindex: dto.noindex ?? false,
          nofollow: dto.nofollow ?? false,
        },
      });
    }
    await this.audit.record({
      action: "admin.seo.route_updated",
      userId: actorUserId,
      entityType: "route_seo",
      entityId: fixed.key,
      metadata: { path: fixed.path, storefront: id, noindex: dto.noindex ?? false },
    });
    return next.find((route) => route.key === fixed.key)!;
  }

  private async tableRoutes(): Promise<AdminRouteSeo[]> {
    await this.ensureRoutes();
    const rows = await this.prisma.routeSeo.findMany();
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return FIXED_ROUTES.map((item) => this.mapRoute(byKey.get(item.key)!, item.path));
  }

  private routesFromStore(stored: Partial<Record<RouteSeoKey, StoredRouteSeo>>): AdminRouteSeo[] {
    return FIXED_ROUTES.map((item) => {
      const row = stored[item.key];
      return {
        key: item.key,
        path: item.path,
        title: row?.title ?? null,
        description: row?.description ?? null,
        imageUrl: row?.imageUrl ?? null,
        canonicalPath: row?.canonicalPath ?? null,
        noindex: row?.noindex ?? false,
        nofollow: row?.nofollow ?? false,
        updatedAt: row?.updatedAt ?? new Date(0).toISOString(),
      };
    });
  }

  private async readProfile(settingsKey: string): Promise<SeoProfile> {
    const row = await this.prisma.systemMeta.findUnique({ where: { key: seoProfileKey(settingsKey) } });
    return parseSeoProfile(row?.value);
  }

  private async readRoutes(settingsKey: string) {
    const row = await this.prisma.systemMeta.findUnique({ where: { key: seoRoutesKey(settingsKey) } });
    return parseRouteStore(row?.value);
  }

  private async writeRoutes(settingsKey: string, routes: AdminRouteSeo[]) {
    const value: Partial<Record<RouteSeoKey, StoredRouteSeo>> = {};
    for (const route of routes) {
      value[route.key] = {
        title: route.title,
        description: route.description,
        imageUrl: route.imageUrl,
        canonicalPath: route.canonicalPath,
        noindex: route.noindex,
        nofollow: route.nofollow,
        updatedAt: route.updatedAt,
      };
    }
    await this.prisma.systemMeta.upsert({
      where: { key: seoRoutesKey(settingsKey) },
      create: { key: seoRoutesKey(settingsKey), value: JSON.stringify(value) },
      update: { value: JSON.stringify(value) },
    });
  }

  private profileFromDto(dto: UpdateAdminSeoSettingsDto, previous: SeoProfile): SeoProfile {
    try {
      const verifications =
        dto.verifications === undefined ? previous.verifications : cleanVerifications(dto.verifications);
      return {
        indexing: dto.indexing === undefined ? previous.indexing : dto.indexing,
        twitterHandle: dto.twitterHandle === undefined ? previous.twitterHandle : cleanHandle(dto.twitterHandle),
        googleSiteVerification: verifications.find((item) => item.provider === "google")?.code ?? null,
        bingSiteVerification: verifications.find((item) => item.provider === "bing")?.code ?? null,
        ogLocale: dto.ogLocale ?? previous.ogLocale,
        sameAs: dto.sameAs === undefined ? previous.sameAs : requireSameAs(dto.sameAs),
        titleSuffix: dto.titleSuffix === undefined ? previous.titleSuffix : cleanSuffix(dto.titleSuffix),
        verifications,
      };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid SEO profile");
    }
  }

  private async ensureRoutes() {
    await this.prisma.routeSeo.createMany({
      data: FIXED_ROUTES.map((item) => ({ key: item.key, path: item.path })),
      skipDuplicates: true,
    });
  }

  async getAppearance(): Promise<AdminAppearance> {
    const brands = await Promise.all(BRAND_IDS.map((id) => this.readBrand(id)));
    return {
      brands: brands.map((brand) => ({
        id: brand.id,
        siteName: brand.siteName,
        logoAlt: brand.logoAlt,
        lightLogoPath: brand.lightLogoPath,
        darkLogoPath: brand.darkLogoPath,
        faviconPath: brand.faviconPath,
      })),
      updatedAt: brands.map((brand) => brand.updatedAt).sort().at(-1) ?? new Date().toISOString(),
    };
  }

  async updateAppearance(
    actorUserId: string,
    dto: UpdateAdminAppearanceDto,
  ): Promise<AdminAppearance> {
    const ids = new Set(dto.brands.map((brand) => brand.id));
    if (ids.size !== 2 || !ids.has("amarpin") || !ids.has("uniqbd")) {
      throw new BadRequestException("Save both AuGetway and UniQbd");
    }

    for (const brand of dto.brands) {
      const profile = STOREFRONTS[brand.id];
      const siteName = brand.siteName.trim();
      const logoAlt = brand.logoAlt.trim();
      const lightLogoPath = this.brandAsset(brand.lightLogoPath, `${profile.siteName} light logo`);
      const darkLogoPath = this.brandAsset(brand.darkLogoPath, `${profile.siteName} dark logo`);
      const adminFaviconPath = this.mediaPath(brand.faviconPath, `${profile.siteName} favicon`);
      const row = await this.prisma.siteContentSettings.upsert({
        where: { key: profile.key },
        create: {
          key: profile.key,
          siteName,
          logoAlt,
          lightLogoPath,
          darkLogoPath,
          adminFaviconPath,
          canonicalBaseUrl: profile.canonicalBaseUrl,
        },
        update: {
          siteName,
          logoAlt,
          lightLogoPath,
          darkLogoPath,
          adminFaviconPath,
        },
      });
      await this.audit.record({
        action: "admin.appearance.updated",
        userId: actorUserId,
        entityType: "site_content_settings",
        entityId: row.id,
        metadata: {
          storefront: brand.id,
          siteName: row.siteName,
          lightLogo: Boolean(row.lightLogoPath),
          darkLogo: Boolean(row.darkLogoPath),
          favicon: Boolean(row.adminFaviconPath),
        },
      });
    }

    return this.getAppearance();
  }

  private async readBrand(id: StorefrontId): Promise<StorefrontBrand & { updatedAt: string }> {
    const profile = STOREFRONTS[id];
    const row = await this.prisma.siteContentSettings.upsert({
      where: { key: profile.key },
      create: {
        key: profile.key,
        siteName: profile.siteName,
        logoAlt: profile.siteName,
        canonicalBaseUrl: profile.canonicalBaseUrl,
      },
      update: {},
    });
    return {
      id,
      siteName: row.siteName,
      logoAlt: row.logoAlt,
      lightLogoPath: this.customLogo(row.lightLogoPath, profile.lightLogoPath),
      darkLogoPath: this.customLogo(row.darkLogoPath, profile.darkLogoPath),
      faviconPath: row.adminFaviconPath,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private customLogo(stored: string | null, builtin: string): string | null {
    if (!stored || stored === builtin) return null;
    return stored;
  }

  private brandAsset(value: string | null | undefined, label: string): string | null {
    if (value == null || value.trim() === "") return null;
    const path = value.trim();
    if (BUILTIN_LOGOS.has(path) || MEDIA_PATH.test(path)) return path;
    throw new BadRequestException(`${label} must be an uploaded JPEG, PNG, or WebP`);
  }

  private mediaPath(value: string | null | undefined, label: string): string | null {
    if (value == null || value.trim() === "") return null;
    const path = value.trim();
    if (!MEDIA_PATH.test(path)) {
      throw new BadRequestException(
        `${label} must be an uploaded JPEG, PNG, or WebP`,
      );
    }
    return path;
  }

  private sanitizeRobotsExtra(raw?: string | null): string | null {
    if (!raw?.trim()) return null;
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const next: string[] = [];
    for (const line of lines) {
      if (next.length >= 40) {
        throw new BadRequestException("Add at most 40 extra robots paths");
      }
      const formatted = `Disallow: ${robotsPath(line)}`;
      if (!next.includes(formatted)) next.push(formatted);
    }
    return next.length ? next.join("\n") : null;
  }

  private map(
    shop: StorefrontId,
    row: {
      siteName: string;
      tagline: string | null;
      defaultSeoTitle: string | null;
      defaultSeoDescription: string | null;
      canonicalBaseUrl: string | null;
      robotsExtra: string | null;
      defaultOgImageUrl: string | null;
      updatedAt: Date;
    },
    extra: SeoProfile = emptySeoProfile(),
  ): AdminSeoSettings {
    return {
      shop,
      siteName: row.siteName,
      tagline: row.tagline,
      defaultSeoTitle: row.defaultSeoTitle,
      defaultSeoDescription: row.defaultSeoDescription,
      canonicalBaseUrl: row.canonicalBaseUrl,
      robotsExtra: row.robotsExtra,
      defaultOgImageUrl: row.defaultOgImageUrl,
      indexing: extra.indexing,
      titleSuffix: extra.titleSuffix,
      twitterHandle: extra.twitterHandle,
      googleSiteVerification: extra.googleSiteVerification,
      bingSiteVerification: extra.bingSiteVerification,
      ogLocale: extra.ogLocale,
      sameAs: extra.sameAs.join("\n") || null,
      verifications: extra.verifications,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapRoute(
    row: {
      key: RouteSeoKey;
      path: string;
      title: string | null;
      description: string | null;
      imageUrl: string | null;
      canonicalPath: string | null;
      noindex: boolean;
      nofollow: boolean;
      updatedAt: Date;
    },
    path: string,
  ): AdminRouteSeo {
    return {
      key: row.key,
      path,
      title: row.title,
      description: row.description,
      imageUrl: row.imageUrl,
      canonicalPath: row.canonicalPath,
      noindex: row.noindex,
      nofollow: row.nofollow,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
