import { Injectable, NotFoundException } from "@nestjs/common";
import {
  DEFAULT_PUBLIC_CONTACT,
  type PaginatedResult,
  type PublicBrand,
  type PublicCategory,
  type PublicHomepageSection,
  type PublicHomepageSlide,
  type PublicProductDetail,
  type PublicProductSummary,
  type PublicRouteSeo,
  type PublicSiteContent,
} from "@amarpin/types";
import {
  InventoryStatus,
  ProductStatus,
  ProductType,
  type Prisma,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  mapBrand,
  mapCategory,
  mapProductDetail,
  mapProductSummary,
} from "./catalog.mapper";
import type { ListProductsQueryDto } from "./dto/list-products.query";
import { contactDetailsKey, parseContactDetails } from "../../shared/contact-details";
import { parseRouteStore, parseSeoProfile, seoProfileKey, seoRoutesKey } from "../../shared/seo-profile";
import { resolveStorefrontId, STOREFRONTS, type StorefrontId } from "./storefronts";

const productPublicInclude = {
  images: { orderBy: { sortOrder: "asc" as const } },
  seoProfiles: true,
  category: true,
  brand: true,
} satisfies Prisma.ProductInclude;

/** Card lists only need the first images and the shop short description. */
const productSummaryInclude = {
  images: { orderBy: { sortOrder: "asc" as const }, take: 12 },
  seoProfiles: { select: { storefront: true, shortDescription: true } },
  category: { select: { id: true, name: true, slug: true, isActive: true } },
  brand: { select: { id: true, name: true, slug: true, isActive: true } },
} satisfies Prisma.ProductInclude;

const DEFAULT_SITE: PublicSiteContent = {
  siteName: "AuGetway",
  tagline: "Digital goods for Bangladesh",
  defaultSeoTitle: "AuGetway — Game top-ups, gift cards & vouchers",
  defaultSeoDescription:
    "Browse published digital products, categories, and brands on AuGetway.",
  canonicalBaseUrl: null,
  robotsExtra: null,
  defaultOgImageUrl: null,
  indexing: true,
  titleSuffix: null,
  twitterHandle: null,
  googleSiteVerification: null,
  bingSiteVerification: null,
  ogLocale: "en_US",
  sameAs: [],
  verifications: [],
  routeSeo: [],
  logoAlt: "AuGetway",
  lightLogoPath: null,
  darkLogoPath: null,
  faviconPath: null,
  contact: DEFAULT_PUBLIC_CONTACT,
  navigation: [
    { id: "default-home", label: "Home", href: "/" },
    { id: "default-products", label: "Products", href: "/products" },
    { id: "default-search", label: "Search", href: "/search" },
  ],
};

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories(): Promise<PublicCategory[]> {
    const rows = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return rows.map(mapCategory);
  }

  async getCategoryBySlug(slug: string): Promise<PublicCategory> {
    const row = await this.prisma.category.findFirst({
      where: { slug, isActive: true },
    });
    if (!row) throw new NotFoundException("Category not found");
    return mapCategory(row);
  }

  async listBrands(): Promise<PublicBrand[]> {
    const rows = await this.prisma.brand.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return rows.map(mapBrand);
  }

  async getBrandBySlug(slug: string): Promise<PublicBrand> {
    const row = await this.prisma.brand.findFirst({
      where: { slug, isActive: true },
    });
    if (!row) throw new NotFoundException("Brand not found");
    return mapBrand(row);
  }

  async listProducts(
    query: ListProductsQueryDto,
    storefront?: string,
  ): Promise<PaginatedResult<PublicProductSummary>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 12;
    const where = await this.buildProductWhere(query, storefront);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: productPublicInclude,
        orderBy: this.buildProductOrder(query.sort ?? "newest"),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => mapProductSummary(row, resolveStorefrontId(storefront))),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getProductBySlug(slug: string, storefront?: string): Promise<PublicProductDetail> {
    const row = await this.prisma.product.findFirst({
      where: { slug, status: ProductStatus.ACTIVE },
      include: productPublicInclude,
    });
    if (!row) throw new NotFoundException("Product not found");
    if (!row.category.isActive) {
      throw new NotFoundException("Product not found");
    }
    if (row.brand && !row.brand.isActive) {
      throw new NotFoundException("Product not found");
    }
    const stock = await this.prisma.inventoryItem.groupBy({
      by: ["packageValueId"],
      where: { productId: row.id, status: InventoryStatus.AVAILABLE },
      _count: { _all: true },
    });
    const availableByPackage = new Map<string, number>();
    for (const rowCount of stock) {
      if (rowCount.packageValueId) availableByPackage.set(rowCount.packageValueId, rowCount._count._all);
    }
    return mapProductDetail(row, availableByPackage, resolveStorefrontId(storefront));
  }

  async getHomepage(storefront?: string): Promise<{
    slides: PublicHomepageSlide[];
    sections: PublicHomepageSection[];
    site: PublicSiteContent;
  }> {
    const [slides, sectionRows, site] = await Promise.all([
      this.prisma.homepageSlide.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      }),
      this.prisma.homepageSection.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: { category: true },
      }),
      this.getSiteContent(storefront),
    ]);

    const loadedSections = await Promise.all(
      sectionRows.map(async (section) => {
        if (
          section.type === "CATEGORY_PRODUCTS" &&
          (!section.categoryId || !section.category?.isActive)
        ) {
          return null;
        }
        return {
          id: section.id,
          title: section.title,
          type: section.type,
          products: await this.productsForSection(section, storefront),
        };
      }),
    );
    const sections = loadedSections.filter((section) => section !== null);

    // Safe defaults when CMS has no content yet.
    const safeSlides =
      slides.length > 0
        ? slides.map((slide) => ({
            id: slide.id,
            title: slide.title,
            subtitle: slide.subtitle,
            imageUrl: slide.imageUrl,
            linkUrl: slide.linkUrl,
            sortOrder: slide.sortOrder,
          }))
        : [
            {
              id: "default-slide",
              title: site.siteName,
              subtitle: site.tagline,
              imageUrl: "/placeholders/hero.svg",
              linkUrl: "/products",
              sortOrder: 0,
            },
          ];

    if (sections.length === 0) {
      const featured = await this.prisma.product.findMany({
        where: { status: ProductStatus.ACTIVE, featured: true },
        include: productSummaryInclude,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      });
      const latest =
        featured.length > 0
          ? featured
          : await this.prisma.product.findMany({
              where: { status: ProductStatus.ACTIVE },
              include: productSummaryInclude,
              orderBy: { createdAt: "desc" },
              take: 8,
            });
      sections.push({
        id: "default-section",
        title: featured.length > 0 ? "Featured" : "Latest products",
        type: featured.length > 0 ? "FEATURED_PRODUCTS" : "LATEST_PRODUCTS",
        products: latest.map((row) =>
          mapProductSummary(row as unknown as Parameters<typeof mapProductSummary>[0], resolveStorefrontId(storefront)),
        ),
      });
    }

    return { slides: safeSlides, sections, site };
  }

  async getSiteContent(storefront?: string): Promise<PublicSiteContent> {
    const id = resolveStorefrontId(storefront);
    const profile = STOREFRONTS[id];
    await this.ensureStorefrontSettings(id);
    const [settings, nav, profileRow, routeRow, contactRow] = await Promise.all([
      this.prisma.siteContentSettings.findUnique({ where: { key: profile.key } }),
      this.prisma.navigationItem.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      }),
      this.prisma.systemMeta.findUnique({ where: { key: seoProfileKey(profile.key) } }),
      this.prisma.systemMeta.findUnique({ where: { key: seoRoutesKey(profile.key) } }),
      this.prisma.systemMeta.findUnique({ where: { key: contactDetailsKey(id) } }),
    ]);
    const extra = parseSeoProfile(profileRow?.value);

    if (!settings && nav.length === 0) {
      return DEFAULT_SITE;
    }

    return {
      siteName: settings?.siteName ?? profile.siteName,
      tagline: settings?.tagline ?? DEFAULT_SITE.tagline,
      defaultSeoTitle: settings?.defaultSeoTitle ?? DEFAULT_SITE.defaultSeoTitle,
      defaultSeoDescription:
        settings?.defaultSeoDescription ?? DEFAULT_SITE.defaultSeoDescription,
      canonicalBaseUrl:
        settings?.canonicalBaseUrl ?? profile.canonicalBaseUrl,
      robotsExtra: settings?.robotsExtra ?? null,
      defaultOgImageUrl: settings?.defaultOgImageUrl ?? null,
      indexing: extra.indexing,
      titleSuffix: extra.titleSuffix,
      twitterHandle: extra.twitterHandle,
      googleSiteVerification: extra.googleSiteVerification,
      bingSiteVerification: extra.bingSiteVerification,
      ogLocale: extra.ogLocale,
      sameAs: extra.sameAs,
      verifications: extra.verifications,
      routeSeo: await this.publicRouteSeo(id, parseRouteStore(routeRow?.value)),
      logoAlt: settings?.logoAlt ?? profile.siteName,
      lightLogoPath: settings?.lightLogoPath ?? profile.lightLogoPath,
      darkLogoPath: settings?.darkLogoPath ?? profile.darkLogoPath,
      faviconPath: settings?.adminFaviconPath ?? null,
      contact: parseContactDetails(contactRow?.value),
      navigation:
        nav.length > 0
          ? nav.map((item) => ({
              id: item.id,
              label: item.label,
              href: item.href,
            }))
          : DEFAULT_SITE.navigation,
    };
  }

  /** Second shop gets its own name and logo row. Products, stock, orders, and chat stay shared. */
  private async ensureStorefrontSettings(id: StorefrontId) {
    if (id === "amarpin") return;
    const profile = STOREFRONTS[id];
    await this.prisma.siteContentSettings.upsert({
      where: { key: profile.key },
      update: {},
      create: {
        key: profile.key,
        siteName: profile.siteName,
        logoAlt: profile.siteName,
        lightLogoPath: profile.lightLogoPath,
        darkLogoPath: profile.darkLogoPath,
        tagline: "Digital goods",
        defaultSeoTitle: `${profile.siteName} — Game top-ups, gift cards & vouchers`,
        defaultSeoDescription: "Browse published digital products.",
        canonicalBaseUrl: profile.canonicalBaseUrl,
      },
    });
  }

  private async publicRouteSeo(
    id: StorefrontId,
    stored: ReturnType<typeof parseRouteStore>,
  ): Promise<PublicRouteSeo[]> {
    const table =
      id === "amarpin" && !stored ? await this.prisma.routeSeo.findMany() : [];
    const byKey = new Map(table.map((row) => [row.key, row]));
    return (["HOME", "PRODUCTS", "BLOG", "REQUEST_PRODUCT"] as const).map((key) => {
      const saved = stored?.[key];
      const row = byKey.get(key);
      const path =
        key === "HOME" ? "/" : key === "PRODUCTS" ? "/products" : key === "BLOG" ? "/blog" : "/request-product";
      return {
        key,
        path,
        title: saved?.title ?? row?.title ?? null,
        description: saved?.description ?? row?.description ?? null,
        imageUrl: saved?.imageUrl ?? row?.imageUrl ?? null,
        canonicalPath: saved?.canonicalPath ?? row?.canonicalPath ?? null,
        noindex: saved?.noindex ?? row?.noindex ?? false,
        nofollow: saved?.nofollow ?? row?.nofollow ?? false,
      };
    });
  }

  async listSitemapEntries(storefront?: string): Promise<{
    products: { slug: string; updatedAt: Date }[];
    categories: { slug: string; updatedAt: Date }[];
    brands: { slug: string; updatedAt: Date }[];
  }> {
    const shop = resolveStorefrontId(storefront);
    const [products, categories, brands] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          status: ProductStatus.ACTIVE,
          NOT: {
            OR: [
              { seoProfiles: { some: { storefront: shop, noindex: true } } },
              { AND: [{ seoProfiles: { none: { storefront: shop } } }, { noindex: true }] },
            ],
          },
        },
        select: { slug: true, updatedAt: true },
      }),
      this.prisma.category.findMany({
        where: { isActive: true, noindex: false },
        select: { slug: true, updatedAt: true },
      }),
      this.prisma.brand.findMany({
        where: { isActive: true, noindex: false },
        select: { slug: true, updatedAt: true },
      }),
    ]);
    // Blog/CMS sitemap entries live on ContentController — published-only.
    return { products, categories, brands };
  }

  private async productsForSection(section: {
    type: string;
    categoryId: string | null;
    productLimit: number;
  }, storefront?: string): Promise<PublicProductSummary[]> {
    const take =
      section.type === "FEATURED_PRODUCTS"
        ? undefined
        : Math.min(Math.max(section.productLimit, 1), 24);
    const where: Prisma.ProductWhereInput = {
      status: ProductStatus.ACTIVE,
      category: { isActive: true },
      OR: [{ brandId: null }, { brand: { isActive: true } }],
    };

    if (section.type === "FEATURED_PRODUCTS") {
      where.featured = true;
    }
    if (section.type === "CATEGORY_PRODUCTS" && section.categoryId) {
      where.categoryId = section.categoryId;
    }

    const rows = await this.prisma.product.findMany({
      where,
      include: productSummaryInclude,
      orderBy:
        section.type === "LATEST_PRODUCTS"
          ? { createdAt: "desc" }
          : [{ sortOrder: "asc" }, { createdAt: "desc" }],
      take,
    });
    return rows.map((row) =>
      mapProductSummary(row as unknown as Parameters<typeof mapProductSummary>[0], resolveStorefrontId(storefront)),
    );
  }

  private async buildProductWhere(
    query: ListProductsQueryDto,
    storefront?: string,
  ): Promise<Prisma.ProductWhereInput> {
    const where: Prisma.ProductWhereInput = {
      status: ProductStatus.ACTIVE,
      category: { isActive: true },
      OR: [{ brandId: null }, { brand: { isActive: true } }],
    };

    if (query.q?.trim()) {
      const term = query.q.trim();
      const q = term.toLowerCase();
      const shop = resolveStorefrontId(storefront);
      where.AND = [
        {
          OR: [
            { titleNormalized: { contains: q } },
            { shortDescription: { contains: term, mode: "insensitive" } },
            { description: { contains: term, mode: "insensitive" } },
            {
              seoProfiles: {
                some: {
                  storefront: shop,
                  OR: [
                    { shortDescription: { contains: term, mode: "insensitive" } },
                    { description: { contains: term, mode: "insensitive" } },
                  ],
                },
              },
            },
          ],
        },
      ];
    }

    if (query.category) {
      const category = await this.prisma.category.findFirst({
        where: { slug: query.category, isActive: true },
      });
      if (!category) {
        where.id = "__none__";
      } else {
        where.categoryId = category.id;
      }
    }

    if (query.brand) {
      const brand = await this.prisma.brand.findFirst({
        where: { slug: query.brand, isActive: true },
      });
      if (!brand) {
        where.id = "__none__";
      } else {
        where.brandId = brand.id;
      }
    }

    if (query.type && Object.values(ProductType).includes(query.type as ProductType)) {
      where.type = query.type as ProductType;
    }

    if (query.minPriceMinor != null || query.maxPriceMinor != null) {
      where.priceMinor = {};
      if (query.minPriceMinor != null) where.priceMinor.gte = query.minPriceMinor;
      if (query.maxPriceMinor != null) where.priceMinor.lte = query.maxPriceMinor;
    }

    return where;
  }

  private buildProductOrder(
    sort: NonNullable<ListProductsQueryDto["sort"]>,
  ): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case "price_asc":
        return [{ priceMinor: "asc" }, { title: "asc" }];
      case "price_desc":
        return [{ priceMinor: "desc" }, { title: "asc" }];
      case "title":
        return [{ title: "asc" }];
      case "newest":
      default:
        return [{ createdAt: "desc" }];
    }
  }
}
