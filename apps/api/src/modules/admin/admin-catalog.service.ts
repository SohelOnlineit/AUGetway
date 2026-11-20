import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AdminBrand,
  AdminCategory,
  AdminPackageStockType,
  AdminPage,
  AdminProductDetail,
  AdminProductListItem,
  AdminProductSeo,
  AdminProductVariationMeta,
} from "@amarpin/types";
import {
  InventoryStatus,
  Prisma,
  ProductStatus,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { blankText, cleanCanonicalPath, cleanSeoImage } from "../../shared/seo-input";
import { AuditService } from "../../shared/audit/audit.service";
import { normalizeTitle, slugify } from "./admin.util";
import { EmptyProductOrderError, UnknownProductOrderError, mergeProductOrder } from "./product-order";
import type {
  AdminProductListQuery,
  UpsertAdminBrandDto,
  UpsertAdminCategoryDto,
  UpsertAdminProductDto,
} from "./dto/catalog.dto";

@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listProducts(
    query: AdminProductListQuery,
  ): Promise<AdminPage<AdminProductListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ProductWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.brandId) where.brandId = query.brandId;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { slug: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: {
          category: true,
          brand: true,
          images: { orderBy: [{ storefront: "asc" }, { sortOrder: "asc" }], take: 1 },
          inventoryItems: { select: { status: true } },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: rows.map((row) => this.mapProductListItem(row)),
    };
  }

  async getProduct(id: string): Promise<AdminProductDetail> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        brand: true,
        images: { orderBy: [{ storefront: "asc" }, { sortOrder: "asc" }] },
        seoProfiles: true,
        inventoryItems: { select: { status: true } },
      },
    });
    if (!product) throw new NotFoundException("Product not found");
    const base = this.mapProductListItem(product);
    return {
      ...base,
      description: product.description,
      shortDescription: product.shortDescription,
      sku: product.sku,
      compareAtMinor: product.compareAtMinor,
      sortOrder: product.sortOrder,
      seoTitle: product.seoTitle,
      seoDescription: product.seoDescription,
      seoImageUrl: product.seoImageUrl,
      noindex: product.noindex,
      seoProfiles: mapSeoProfiles(product),
      publishedAt: product.publishedAt?.toISOString() ?? null,
      variationMeta: readVariationMeta(product.variationMeta),
      images: product.images.map((image) => ({
        id: image.id,
        url: image.url,
        alt: image.alt,
        sortOrder: image.sortOrder,
        storefront: image.storefront === "uniqbd" ? "uniqbd" as const : "amarpin" as const,
      })),
      createdAt: product.createdAt.toISOString(),
    };
  }

  async createProduct(
    actorUserId: string,
    dto: UpsertAdminProductDto,
  ): Promise<AdminProductDetail> {
    await this.assertCategory(dto.categoryId);
    if (dto.brandId) await this.assertBrand(dto.brandId);
    const slug = await this.uniqueProductSlug(dto.slug || dto.title);
    const publishedAt =
      dto.status === ProductStatus.ACTIVE ? new Date() : null;

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.product.create({
      data: {
        title: dto.title.trim(),
        slug,
        titleNormalized: normalizeTitle(dto.title),
        description: dto.description?.trim() || null,
        shortDescription: dto.shortDescription?.trim() || null,
        sku: dto.sku?.trim() || null,
        status: dto.status,
        type: dto.type,
        categoryId: dto.categoryId,
        brandId: dto.brandId || null,
        priceMinor: listedPrice(dto),
        compareAtMinor: dto.compareAtMinor ?? null,
        currency: (dto.currency ?? "BDT").toUpperCase(),
        featured: dto.featured ?? false,
        sortOrder: await this.nextSortOrder(dto.sortOrder),
        ...seoFields(dto),
        variationMeta: this.variationData(dto.variationMeta),
        publishedAt,
        images: dto.images?.length
          ? {
              create: dto.images.map((image, index) => ({
                url: image.url,
                alt: image.alt ?? null,
                sortOrder: image.sortOrder ?? index,
                storefront: image.storefront === "uniqbd" ? "uniqbd" : "amarpin",
              })),
            }
          : undefined,
      },
    });
      await saveProductSeo(tx, row.id, dto);
      return row;
    });

    await this.audit.record({
      action: "admin.product.create",
      userId: actorUserId,
      entityType: "product",
      entityId: created.id,
      metadata: { status: created.status, slug: created.slug },
    });
    return this.getProduct(created.id);
  }

  async reorderProducts(actorUserId: string, ids: string[]) {
    const catalog = await this.prisma.product.findMany({
      select: { id: true, sortOrder: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
    let merged: ReturnType<typeof mergeProductOrder>;
    try {
      merged = mergeProductOrder(
        catalog.map((row) => row.id),
        ids,
      );
    } catch (error) {
      if (error instanceof UnknownProductOrderError || error instanceof EmptyProductOrderError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    const sortById = new Map(catalog.map((row) => [row.id, row.sortOrder]));
    const updates = merged.ids.flatMap((id, index) =>
      sortById.get(id) === index
        ? []
        : [this.prisma.product.update({ where: { id }, data: { sortOrder: index } })],
    );
    if (updates.length) await this.prisma.$transaction(updates);
    await this.audit.record({
      action: "admin.product.reorder",
      userId: actorUserId,
      entityType: "product",
      entityId: merged.ids[0],
      metadata: { count: merged.count },
    });
    return { ok: true };
  }

  private async nextSortOrder(requested?: number) {
    if (requested !== undefined && requested > 0) return requested;
    const highest = await this.prisma.product.aggregate({ _max: { sortOrder: true } });
    return (highest._max.sortOrder ?? -1) + 1;
  }

  async updateProduct(
    actorUserId: string,
    id: string,
    dto: UpsertAdminProductDto,
  ): Promise<AdminProductDetail> {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Product not found");
    await this.assertCategory(dto.categoryId);
    if (dto.brandId) await this.assertBrand(dto.brandId);

    const slug = dto.slug?.trim()
      ? await this.uniqueProductSlug(dto.slug, id)
      : existing.slug;

    let publishedAt = existing.publishedAt;
    if (dto.status === ProductStatus.ACTIVE && !publishedAt) {
      publishedAt = new Date();
    }
    if (dto.status !== ProductStatus.ACTIVE) {
      publishedAt = publishedAt; // keep historical publish timestamp
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          title: dto.title.trim(),
          slug,
          titleNormalized: normalizeTitle(dto.title),
          description: dto.description?.trim() || null,
          shortDescription: dto.shortDescription?.trim() || null,
          sku: dto.sku?.trim() || null,
          status: dto.status,
          type: dto.type,
          categoryId: dto.categoryId,
          brandId: dto.brandId || null,
          priceMinor: listedPrice(dto),
          compareAtMinor: dto.compareAtMinor ?? null,
          variationMeta: this.variationData(dto.variationMeta),
          currency: (dto.currency ?? existing.currency).toUpperCase(),
          featured: dto.featured ?? false,
          sortOrder: dto.sortOrder ?? existing.sortOrder,
          ...seoFields(dto),
          publishedAt,
        },
      });

      if (dto.images) {
        await tx.productImage.deleteMany({ where: { productId: id } });
        if (dto.images.length > 0) {
          await tx.productImage.createMany({
            data: dto.images.map((image, index) => ({
              productId: id,
              url: image.url,
              alt: image.alt ?? null,
              sortOrder: image.sortOrder ?? index,
              storefront: image.storefront === "uniqbd" ? "uniqbd" : "amarpin",
            })),
          });
        }
      }
      await saveProductSeo(tx, id, dto);
    });

    await this.audit.record({
      action: "admin.product.update",
      userId: actorUserId,
      entityType: "product",
      entityId: id,
      metadata: { status: dto.status, slug },
    });
    return this.getProduct(id);
  }

  async listCategories(): Promise<AdminCategory[]> {
    const rows = await this.prisma.category.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      parentId: row.parentId,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      seoImageUrl: row.seoImageUrl,
      noindex: row.noindex,
      productCount: row._count.products,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async upsertCategory(
    actorUserId: string,
    dto: UpsertAdminCategoryDto,
    id?: string,
  ): Promise<AdminCategory> {
    const slug = await this.uniqueCategorySlug(dto.slug || dto.name, id);
    let path: string[] = [];
    let depth = 0;
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) throw new BadRequestException("Parent category not found");
      if (id && (parent.id === id || parent.path.includes(id))) {
        throw new BadRequestException("Invalid category parent");
      }
      path = [...parent.path, parent.id];
      depth = parent.depth + 1;
    }

    const shared = {
      name: dto.name.trim(),
      slug,
      ...(dto.description !== undefined ? { description: blankText(dto.description) } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl || null } : {}),
      ...seoFields(dto),
    };
    const parentFields =
      dto.parentId !== undefined || !id
        ? { parentId: dto.parentId || null, path, depth }
        : {};

    const row = id
      ? await this.prisma.category.update({ where: { id }, data: { ...shared, ...parentFields } })
      : await this.prisma.category.create({
          data: {
            description: null,
            sortOrder: 0,
            isActive: true,
            ...shared,
            ...parentFields,
          },
        });

    await this.audit.record({
      action: id ? "admin.category.update" : "admin.category.create",
      userId: actorUserId,
      entityType: "category",
      entityId: row.id,
      metadata: { slug: row.slug },
    });

    const withCount = await this.prisma.category.findUniqueOrThrow({
      where: { id: row.id },
      include: { _count: { select: { products: true } } },
    });
    return {
      id: withCount.id,
      name: withCount.name,
      slug: withCount.slug,
      description: withCount.description,
      parentId: withCount.parentId,
      sortOrder: withCount.sortOrder,
      isActive: withCount.isActive,
      seoTitle: withCount.seoTitle,
      seoDescription: withCount.seoDescription,
      seoImageUrl: withCount.seoImageUrl,
      noindex: withCount.noindex,
      productCount: withCount._count.products,
      createdAt: withCount.createdAt.toISOString(),
      updatedAt: withCount.updatedAt.toISOString(),
    };
  }

  async deleteCategory(actorUserId: string, id: string): Promise<{ deleted: true }> {
    const row = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true, children: true } } },
    });
    if (!row) throw new NotFoundException("Category not found");
    if (row._count.products > 0) {
      throw new BadRequestException(
        "Move the products out of this category before deleting it.",
      );
    }
    if (row._count.children > 0) {
      throw new BadRequestException("Delete or move the subcategories first.");
    }

    await this.prisma.$transaction([
      this.prisma.homepageSection.updateMany({
        where: { categoryId: id },
        data: { categoryId: null },
      }),
      this.prisma.category.delete({ where: { id } }),
    ]);
    await this.audit.record({
      action: "admin.category.delete",
      userId: actorUserId,
      entityType: "category",
      entityId: id,
      metadata: { slug: row.slug, name: row.name },
    });
    return { deleted: true };
  }

  async listBrands(): Promise<AdminBrand[]> {
    const rows = await this.prisma.brand.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: { name: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      logoUrl: row.logoUrl,
      isActive: row.isActive,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      seoImageUrl: row.seoImageUrl,
      noindex: row.noindex,
      productCount: row._count.products,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async upsertBrand(
    actorUserId: string,
    dto: UpsertAdminBrandDto,
    id?: string,
  ): Promise<AdminBrand> {
    const slug = await this.uniqueBrandSlug(dto.slug || dto.name, id);
    const shared = {
      name: dto.name.trim(),
      slug,
      ...(dto.description !== undefined ? { description: blankText(dto.description) } : {}),
      ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl || null } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      ...seoFields(dto),
    };
    const row = id
      ? await this.prisma.brand.update({ where: { id }, data: shared })
      : await this.prisma.brand.create({
          data: { description: null, isActive: true, ...shared },
        });

    await this.audit.record({
      action: id ? "admin.brand.update" : "admin.brand.create",
      userId: actorUserId,
      entityType: "brand",
      entityId: row.id,
      metadata: { slug: row.slug },
    });

    const withCount = await this.prisma.brand.findUniqueOrThrow({
      where: { id: row.id },
      include: { _count: { select: { products: true } } },
    });
    return {
      id: withCount.id,
      name: withCount.name,
      slug: withCount.slug,
      description: withCount.description,
      logoUrl: withCount.logoUrl,
      isActive: withCount.isActive,
      seoTitle: withCount.seoTitle,
      seoDescription: withCount.seoDescription,
      seoImageUrl: withCount.seoImageUrl,
      noindex: withCount.noindex,
      productCount: withCount._count.products,
      createdAt: withCount.createdAt.toISOString(),
      updatedAt: withCount.updatedAt.toISOString(),
    };
  }

  private mapProductListItem(row: {
    id: string;
    title: string;
    slug: string;
    status: ProductStatus;
    type: string;
    priceMinor: number;
    currency: string;
    featured: boolean;
    sku: string | null;
    updatedAt: Date;
    category: { id: string; name: string; slug: string };
    brand: { id: string; name: string; slug: string } | null;
    images: Array<{ url: string }>;
    inventoryItems: Array<{ status: InventoryStatus }>;
  }): AdminProductListItem {
    const stockAvailable = row.inventoryItems.filter(
      (item) => item.status === InventoryStatus.AVAILABLE,
    ).length;
    const stockReserved = row.inventoryItems.filter(
      (item) => item.status === InventoryStatus.RESERVED,
    ).length;
    const stockSold = row.inventoryItems.filter(
      (item) => item.status === InventoryStatus.SOLD,
    ).length;
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status,
      type: row.type as AdminProductListItem["type"],
      priceMinor: row.priceMinor,
      currency: row.currency,
      featured: row.featured,
      sku: row.sku,
      imageUrl: row.images[0]?.url ?? null,
      category: {
        id: row.category.id,
        name: row.category.name,
        slug: row.category.slug,
      },
      brand: row.brand
        ? { id: row.brand.id, name: row.brand.name, slug: row.brand.slug }
        : null,
      stockAvailable,
      stockReserved,
      stockSold,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async assertCategory(id: string) {
    const row = await this.prisma.category.findUnique({ where: { id } });
    if (!row) throw new BadRequestException("Category not found");
  }

  private async assertBrand(id: string) {
    const row = await this.prisma.brand.findUnique({ where: { id } });
    if (!row) throw new BadRequestException("Brand not found");
  }

  private async uniqueProductSlug(raw: string, excludeId?: string) {
    const base = slugify(raw) || "product";
    let candidate = base;
    let i = 1;
    while (true) {
      const found = await this.prisma.product.findUnique({
        where: { slug: candidate },
      });
      if (!found || found.id === excludeId) return candidate;
      i += 1;
      candidate = `${base}-${i}`;
    }
  }

  private async uniqueCategorySlug(raw: string, excludeId?: string) {
    const base = slugify(raw) || "category";
    let candidate = base;
    let i = 1;
    while (true) {
      const found = await this.prisma.category.findUnique({
        where: { slug: candidate },
      });
      if (!found || found.id === excludeId) return candidate;
      i += 1;
      candidate = `${base}-${i}`;
    }
  }

  private async uniqueBrandSlug(raw: string, excludeId?: string) {
    const base = slugify(raw) || "brand";
    let candidate = base;
    let i = 1;
    while (true) {
      const found = await this.prisma.brand.findUnique({
        where: { slug: candidate },
      });
      if (!found || found.id === excludeId) return candidate;
      i += 1;
      candidate = `${base}-${i}`;
    }
  }

  private variationData(
    meta: UpsertAdminProductDto["variationMeta"],
  ): Prisma.InputJsonValue | typeof Prisma.DbNull {
    if (!meta) return Prisma.DbNull;
    return {
      regions: cleanCodes(meta.regions),
      defaultRegion: meta.defaultRegion?.trim() || "",
      showPackageImages: meta.showPackageImages === true,
      regionImages: cleanRegionImages(meta.regionImages, meta.regions),
      packages: meta.packages.map((pkg) => ({
        name: pkg.name.trim(),
        valueId: pkg.valueId.trim(),
        priceMinor: pkg.priceMinor,
        stockType: pkg.stockType,
        imageUrl: pkg.imageUrl?.trim() || null,
        manualStock: pkg.manualStock ?? 0,
        regions: cleanCodes(pkg.regions),
      })),
      customerInputs: cleanCustomerInputs(meta.customerInputs),
    };
  }
}

const PACKAGE_STOCK = new Set<AdminPackageStockType>(["manual", "giftcard", "api"]);

function listedPrice(dto: UpsertAdminProductDto) {
  return dto.variationMeta?.packages[0]?.priceMinor ?? dto.priceMinor;
}

function cleanCodes(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function readVariationMeta(value: Prisma.JsonValue | null): AdminProductVariationMeta | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const packages = Array.isArray(row.packages)
    ? row.packages.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const pkg = item as Record<string, unknown>;
        const name = typeof pkg.name === "string" ? pkg.name.trim() : "";
        const valueId = typeof pkg.valueId === "string" ? pkg.valueId.trim() : "";
        const priceMinor = Number(pkg.priceMinor);
        const stockType =
          typeof pkg.stockType === "string" && PACKAGE_STOCK.has(pkg.stockType as AdminPackageStockType)
            ? (pkg.stockType as AdminPackageStockType)
            : "manual";
        if (!name || !valueId || !Number.isInteger(priceMinor) || priceMinor < 0) return [];
        return [
          {
            name,
            valueId,
            priceMinor,
            stockType,
            imageUrl: typeof pkg.imageUrl === "string" && pkg.imageUrl.trim() ? pkg.imageUrl.trim() : null,
            manualStock: Math.max(0, Math.round(Number(pkg.manualStock) || 0)),
            regions: Array.isArray(pkg.regions) ? cleanCodes(pkg.regions.map(String)) : [],
          },
        ];
      })
    : [];
  const customerInputs = readCustomerInputs(row.customerInputs);
  if (!packages.length && !Array.isArray(row.regions) && !customerInputs.length) return null;
  const regions = Array.isArray(row.regions) ? cleanCodes(row.regions.map(String)) : [];
  return {
    regions,
    defaultRegion: typeof row.defaultRegion === "string" ? row.defaultRegion.trim() : "",
    showPackageImages: row.showPackageImages === true,
    regionImages: readRegionImages(row.regionImages, regions),
    packages,
    customerInputs,
  };
}

function cleanCustomerInputs(
  inputs: Array<{ label: string; placeholder?: string; required: boolean }> | undefined,
) {
  return readCustomerInputs(inputs);
}

function readCustomerInputs(value: unknown) {
  if (!Array.isArray(value)) return [];
  const next = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label.trim().slice(0, 160) : "";
    if (!label) continue;
    const placeholder = typeof row.placeholder === "string" ? row.placeholder.trim().slice(0, 200) : "";
    next.push({ label, placeholder, required: row.required === true });
    if (next.length === 12) break;
  }
  return next;
}

function cleanRegionImages(
  images: Array<{ region: string; imageUrl: string }> | undefined,
  regions: string[],
) {
  const allowed = new Set(cleanCodes(regions).map((region) => region.toUpperCase()));
  const seen = new Set<string>();
  const next = [];
  for (const image of images ?? []) {
    const region = image.region.trim();
    const imageUrl = image.imageUrl.trim();
    const key = region.toUpperCase();
    if (!region || !imageUrl || !allowed.has(key) || seen.has(key)) continue;
    if (!imageUrl.startsWith("/") && !imageUrl.startsWith("http://") && !imageUrl.startsWith("https://")) continue;
    seen.add(key);
    next.push({ region, imageUrl });
  }
  return next;
}

function mapSeoProfiles(product: {
  shortDescription: string | null;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoImageUrl: string | null;
  noindex: boolean;
  seoProfiles?: Array<{
    storefront: string;
    seoTitle: string | null;
    seoDescription: string | null;
    seoImageUrl: string | null;
    keywords: string | null;
    canonicalPath: string | null;
    noindex: boolean;
    nofollow: boolean;
    shortDescription: string | null;
    description: string | null;
  }>;
}): AdminProductSeo[] {
  const saved = new Map((product.seoProfiles ?? []).map((row) => [row.storefront, row]));
  return (["amarpin", "uniqbd"] as const).map((storefront) => {
    const row = saved.get(storefront);
    if (row) {
      return {
        storefront,
        seoTitle: row.seoTitle,
        seoDescription: row.seoDescription,
        seoImageUrl: row.seoImageUrl,
        keywords: row.keywords,
        canonicalPath: row.canonicalPath,
        noindex: row.noindex,
        nofollow: row.nofollow,
        shortDescription: row.shortDescription,
        description: row.description,
      };
    }
    if (storefront === "amarpin") {
      return {
        storefront,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        seoImageUrl: product.seoImageUrl,
        keywords: null,
        canonicalPath: null,
        noindex: product.noindex,
        nofollow: false,
        shortDescription: product.shortDescription,
        description: product.description,
      };
    }
    return {
      storefront,
      seoTitle: null,
      seoDescription: null,
      seoImageUrl: null,
      keywords: null,
      canonicalPath: null,
      noindex: false,
      nofollow: false,
      shortDescription: null,
      description: null,
    };
  });
}

async function saveProductSeo(
  db: Prisma.TransactionClient,
  productId: string,
  dto: UpsertAdminProductDto,
) {
  const profiles = dto.seoProfiles?.length
    ? dto.seoProfiles
    : [
        {
          storefront: "amarpin" as const,
          seoTitle: dto.seoTitle,
          seoDescription: dto.seoDescription,
          seoImageUrl: dto.seoImageUrl,
          keywords: null,
          canonicalPath: null,
          noindex: dto.noindex,
          nofollow: false,
        },
      ];
  for (const row of profiles) {
    const storefront = row.storefront === "uniqbd" ? "uniqbd" : "amarpin";
    const data = {
      seoTitle: blankText(row.seoTitle),
      seoDescription: blankText(row.seoDescription),
      seoImageUrl: cleanSeoImage(row.seoImageUrl),
      keywords: blankText(row.keywords),
      canonicalPath: cleanCanonicalPath(row.canonicalPath),
      noindex: row.noindex === true,
      nofollow: row.nofollow === true,
      ...(row.shortDescription !== undefined
        ? { shortDescription: blankText(row.shortDescription) }
        : {}),
      ...(row.description !== undefined ? { description: blankText(row.description) } : {}),
    };
    await db.productSeo.upsert({
      where: { productId_storefront: { productId, storefront } },
      create: { productId, storefront, ...data },
      update: data,
    });
    if (storefront === "amarpin") {
      await db.product.update({
        where: { id: productId },
        data: {
          seoTitle: data.seoTitle,
          seoDescription: data.seoDescription,
          seoImageUrl: data.seoImageUrl,
          noindex: data.noindex,
          ...(data.shortDescription !== undefined ? { shortDescription: data.shortDescription } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
        },
      });
    }
  }
}

function seoFields(dto: {
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoImageUrl?: string | null;
  noindex?: boolean;
}) {
  return {
    ...(dto.seoTitle !== undefined ? { seoTitle: blankText(dto.seoTitle) } : {}),
    ...(dto.seoDescription !== undefined ? { seoDescription: blankText(dto.seoDescription) } : {}),
    ...(dto.seoImageUrl !== undefined ? { seoImageUrl: cleanSeoImage(dto.seoImageUrl) } : {}),
    ...(dto.noindex !== undefined ? { noindex: dto.noindex } : {}),
  };
}

function readRegionImages(value: unknown, regions: string[]) {
  if (!Array.isArray(value)) return [];
  const images = value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const region = typeof row.region === "string" ? row.region : "";
    const imageUrl = typeof row.imageUrl === "string" ? row.imageUrl : "";
    return region && imageUrl ? [{ region, imageUrl }] : [];
  });
  return cleanRegionImages(images, regions);
}
