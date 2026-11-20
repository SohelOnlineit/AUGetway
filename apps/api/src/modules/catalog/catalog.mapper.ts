import type {
  PublicBrand,
  PublicCategory,
  PublicCatalogImage,
  PublicCustomerInput,
  PublicProductDetail,
  PublicProductPackage,
  PublicProductSummary,
  PublicRegionImage,
} from "@amarpin/types";
import type {
  Brand,
  Category,
  Product,
  ProductImage,
  ProductSeo,
} from "../../generated/prisma/client";

type ProductWithRelations = Product & {
  images: ProductImage[];
  category: Category;
  brand: Brand | null;
  seoProfiles?: ProductSeo[];
};

export function shopCopy(
  product: {
    shortDescription: string | null;
    description?: string | null;
    seoProfiles?: Array<{
      storefront: string;
      shortDescription: string | null;
      description: string | null;
    }>;
  },
  storefront: "amarpin" | "uniqbd",
) {
  const rows = product.seoProfiles ?? [];
  const own = rows.find((row) => row.storefront === storefront);
  const amarpin = rows.find((row) => row.storefront === "amarpin");
  const text = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  };
  return {
    shortDescription:
      text(own?.shortDescription) ??
      (storefront === "uniqbd" ? text(amarpin?.shortDescription) : null) ??
      text(product.shortDescription),
    description:
      text(own?.description) ??
      (storefront === "uniqbd" ? text(amarpin?.description) : null) ??
      text(product.description),
  };
}

function seoForShop(product: ProductWithRelations, storefront: "amarpin" | "uniqbd") {
  const rows = product.seoProfiles ?? [];
  const own = rows.find((row) => row.storefront === storefront);
  const amarpin = rows.find((row) => row.storefront === "amarpin");
  const text = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  };
  const title = text(own?.seoTitle) ?? (storefront === "uniqbd" ? text(amarpin?.seoTitle) : null) ?? text(product.seoTitle);
  const description =
    text(own?.seoDescription) ??
    (storefront === "uniqbd" ? text(amarpin?.seoDescription) : null) ??
    text(product.seoDescription);
  const image =
    text(own?.seoImageUrl) ??
    (storefront === "uniqbd" ? text(amarpin?.seoImageUrl) : null) ??
    text(product.seoImageUrl);
  const keywords = text(own?.keywords) ?? (storefront === "uniqbd" ? text(amarpin?.keywords) : null);
  const canonical = text(own?.canonicalPath) ?? (storefront === "uniqbd" ? text(amarpin?.canonicalPath) : null);
  const flags = own ?? (storefront === "uniqbd" ? amarpin : undefined);
  return {
    seoTitle: title,
    seoDescription: description,
    seoImageUrl: image,
    keywords,
    canonicalPath: canonical,
    noindex: flags?.noindex ?? product.noindex,
    nofollow: flags?.nofollow ?? false,
  };
}

export function mapImage(image: ProductImage): PublicCatalogImage {
  return {
    id: image.id,
    url: image.url,
    alt: image.alt,
    sortOrder: image.sortOrder,
  };
}

export function mapCategory(category: Category): PublicCategory {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    parentId: category.parentId,
    depth: category.depth,
    imageUrl: category.imageUrl,
    seoTitle: category.seoTitle,
    seoDescription: category.seoDescription,
    seoImageUrl: category.seoImageUrl,
    noindex: category.noindex,
  };
}

export function mapBrand(brand: Brand): PublicBrand {
  return {
    id: brand.id,
    name: brand.name,
    slug: brand.slug,
    description: brand.description,
    logoUrl: brand.logoUrl,
    seoTitle: brand.seoTitle,
    seoDescription: brand.seoDescription,
    seoImageUrl: brand.seoImageUrl,
    noindex: brand.noindex,
  };
}

export function pickPrimaryImageUrl(
  images: Array<{ url: string; storefront: string; sortOrder: number }>,
  storefront: "amarpin" | "uniqbd" = "amarpin",
): string | null {
  return imagesForShop(images, storefront)[0]?.url ?? null;
}

function imagesForShop<T extends { storefront: string; sortOrder: number }>(
  images: T[],
  storefront: "amarpin" | "uniqbd",
): T[] {
  const shop = storefront === "uniqbd" ? "uniqbd" : "amarpin";
  const sorted = [...images].sort((a, b) => a.sortOrder - b.sortOrder);
  const own = sorted.filter((image) => (image.storefront || "amarpin") === shop);
  if (own.length > 0 || shop === "amarpin") return own;
  return sorted.filter((image) => (image.storefront || "amarpin") === "amarpin");
}

export function mapProductSummary(
  product: ProductWithRelations,
  storefront: "amarpin" | "uniqbd" = "amarpin",
): PublicProductSummary {
  const images = imagesForShop(product.images, storefront);
  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    shortDescription: shopCopy(product, storefront).shortDescription,
    type: product.type,
    priceMinor: product.priceMinor,
    compareAtMinor: product.compareAtMinor,
    currency: product.currency,
    featured: product.featured,
    primaryImage: images[0] ? mapImage(images[0]) : null,
    category: {
      id: product.category.id,
      name: product.category.name,
      slug: product.category.slug,
    },
    brand: product.brand
      ? {
          id: product.brand.id,
          name: product.brand.name,
          slug: product.brand.slug,
        }
      : null,
    ratingCount: product.ratingCount,
    ratingAverage:
      product.ratingCount > 0
        ? Math.round((product.ratingSum / product.ratingCount) * 10) / 10
        : null,
    regionImages: readStorefrontRegions(product.variationMeta).regionImages,
    packageCount: readPublicPackages(product.variationMeta).length,
  };
}

export function mapProductDetail(
  product: ProductWithRelations,
  availableByPackage: ReadonlyMap<string, number> = new Map(),
  storefront: "amarpin" | "uniqbd" = "amarpin",
): PublicProductDetail {
  const images = imagesForShop(product.images, storefront);
  return {
    ...mapProductSummary(product, storefront),
    description: shopCopy(product, storefront).description,
    images: images.map(mapImage),
    ...seoForShop(product, storefront),
    publishedAt: product.publishedAt?.toISOString() ?? null,
    ...readStorefrontRegions(product.variationMeta),
    packages: publicPackageList(readPublicPackages(product.variationMeta), availableByPackage),
    customerInputs: readCustomerInputs(product.variationMeta),
  };
}

export interface ParsedProductPackage {
  valueId: string;
  name: string;
  priceMinor: number;
  region: string | null;
  regions: string[];
  imageUrl: string | null;
  stockType: "manual" | "giftcard" | "api";
  manualStock: number;
}

const PACKAGE_STOCK = new Set<ParsedProductPackage["stockType"]>(["manual", "giftcard", "api"]);

export function readPublicPackages(value: unknown): ParsedProductPackage[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.packages)) return [];
  const packages: ParsedProductPackage[] = [];
  for (const item of row.packages) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const pkg = item as Record<string, unknown>;
    const name = typeof pkg.name === "string" ? pkg.name.trim() : "";
    const valueId = typeof pkg.valueId === "string" ? pkg.valueId.trim() : "";
    const priceMinor = Number(pkg.priceMinor);
    const stockType =
      typeof pkg.stockType === "string" && PACKAGE_STOCK.has(pkg.stockType as ParsedProductPackage["stockType"])
        ? (pkg.stockType as ParsedProductPackage["stockType"])
        : "manual";
    if (!name || !valueId || !Number.isInteger(priceMinor) || priceMinor < 0) continue;
    const regions = Array.isArray(pkg.regions)
      ? pkg.regions
          .filter((region): region is string => typeof region === "string" && region.trim().length > 0)
          .map((region) => region.trim())
      : [];
    const imageUrl = typeof pkg.imageUrl === "string" ? pkg.imageUrl.trim() : "";
    packages.push({
      valueId,
      name,
      priceMinor,
      region: regions[0] || null,
      regions,
      imageUrl: imageUrl || null,
      stockType,
      manualStock: Math.max(0, Math.round(Number(pkg.manualStock) || 0)),
    });
  }
  return packages;
}

export function deliveryCardFace(
  variationMeta: unknown,
  packageValueId: string | null | undefined,
  fallbackTitle: string,
): { name: string; region: string | null } {
  const packages = readPublicPackages(variationMeta);
  const pack = packageValueId
    ? packages.find((item) => item.valueId === packageValueId)
    : undefined;
  return {
    name: pack?.name || fallbackTitle,
    region: pack?.region ?? null,
  };
}

export function publicPackageList(
  packages: ParsedProductPackage[],
  availableByPackage: ReadonlyMap<string, number>,
): PublicProductPackage[] {
  return packages.map((pkg) => {
    const availableCount =
      pkg.stockType === "manual" ? pkg.manualStock : (availableByPackage.get(pkg.valueId) ?? 0);
    return {
      valueId: pkg.valueId,
      name: pkg.name,
      priceMinor: pkg.priceMinor,
      region: pkg.region,
      regions: pkg.regions,
      imageUrl: pkg.imageUrl,
      inStock: availableCount > 0,
      availableCount,
      instant: pkg.stockType !== "manual",
    };
  });
}

export function readCustomerInputs(value: unknown): PublicCustomerInput[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const raw = (value as Record<string, unknown>).customerInputs;
  if (!Array.isArray(raw)) return [];
  const next: PublicCustomerInput[] = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const row = item as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label.trim() : "";
    if (!label) return;
    next.push({
      id: `input-${index}`,
      label,
      placeholder: typeof row.placeholder === "string" ? row.placeholder.trim() : "",
      required: row.required === true,
    });
  });
  return next.slice(0, 12);
}

export interface StoredCustomerAnswer {
  label: string;
  value: string;
}

export function readStoredCustomerAnswers(value: unknown): StoredCustomerAnswer[] {
  if (!Array.isArray(value)) return [];
  const next: StoredCustomerAnswer[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label.trim().slice(0, 120) : "";
    const answer = typeof row.value === "string" ? row.value.trim().slice(0, 500) : "";
    if (!label || !answer) continue;
    next.push({ label, value: answer });
    if (next.length >= 12) break;
  }
  return next;
}

/** Maps submitted field ids onto the product's customer input boxes. */
export function collectCustomerAnswers(
  variationMeta: unknown,
  submitted: Array<{ id?: string; value?: string }> | undefined,
): { keepExisting: boolean; missingLabel: string | null; answers: StoredCustomerAnswer[] } {
  const fields = readCustomerInputs(variationMeta);
  if (!fields.length) return { keepExisting: false, missingLabel: null, answers: [] };
  if (submitted === undefined) {
    const required = fields.find((field) => field.required);
    return {
      keepExisting: !required,
      missingLabel: required?.label ?? null,
      answers: [],
    };
  }
  const byId = new Map(
    submitted.map((item) => [String(item.id ?? "").trim(), String(item.value ?? "")]),
  );
  const answers: StoredCustomerAnswer[] = [];
  for (const field of fields) {
    const answer = (byId.get(field.id) ?? "").trim().slice(0, 500);
    if (field.required && !answer) {
      return { keepExisting: false, missingLabel: field.label, answers: [] };
    }
    if (answer) answers.push({ label: field.label, value: answer });
  }
  return { keepExisting: false, missingLabel: null, answers };
}

function readStorefrontRegions(value: unknown): {
  regions: string[];
  defaultRegion: string | null;
  regionImages: PublicRegionImage[];
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { regions: [], defaultRegion: null, regionImages: [] };
  }
  const row = value as Record<string, unknown>;
  const regions = Array.isArray(row.regions)
    ? row.regions
        .filter((region): region is string => typeof region === "string" && region.trim().length > 0)
        .map((region) => region.trim())
    : [];
  const defaultRegion = typeof row.defaultRegion === "string" ? row.defaultRegion.trim() : "";
  const allowed = new Set(regions.map((region) => region.toUpperCase()));
  const regionImages: PublicRegionImage[] = [];
  if (Array.isArray(row.regionImages)) {
    for (const item of row.regionImages) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const image = item as Record<string, unknown>;
      const region = typeof image.region === "string" ? image.region.trim() : "";
      const imageUrl = typeof image.imageUrl === "string" ? image.imageUrl.trim() : "";
      if (!region || !imageUrl || (allowed.size > 0 && !allowed.has(region.toUpperCase()))) continue;
      if (regionImages.some((entry) => entry.region.toUpperCase() === region.toUpperCase())) continue;
      regionImages.push({ region, imageUrl });
    }
  }
  return { regions, defaultRegion: defaultRegion || null, regionImages };
}
