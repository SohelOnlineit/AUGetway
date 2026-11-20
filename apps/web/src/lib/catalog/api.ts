import { cache } from "react";
import {
  DEFAULT_PUBLIC_CONTACT,
  type PaginatedResult,
  type PublicBrand,
  type PublicCategory,
  type PublicProductDetail,
  type PublicProductSummary,
  type PublicReviewFeed,
  type PublicSiteContent,
} from "@amarpin/types";
import { getApiBaseUrl } from "@/lib/auth/api-base";
import { currentStorefront } from "@/lib/storefront.server";
import { STOREFRONT_LOGOS } from "@/lib/storefront";

export class CatalogApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function catalogFetch<T>(
  path: string,
  init?: RequestInit & { revalidate?: number },
): Promise<T> {
  const revalidate = init?.revalidate ?? 60;
  const storefront = await currentStorefront();
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "x-storefront": storefront,
    },
    next: { revalidate },
  });
  if (!response.ok) {
    throw new CatalogApiError(
      `Catalog request failed (${response.status})`,
      response.status,
    );
  }
  return (await response.json()) as T;
}

export function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.APP_PUBLIC_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export const fetchSiteContent = cache(async function fetchSiteContent(): Promise<PublicSiteContent> {
  const storefront = await currentStorefront();
  const logos = STOREFRONT_LOGOS[storefront];
  const siteName = storefront === "uniqbd" ? "UniQbd" : "AuGetway";
  try {
    return await catalogFetch<PublicSiteContent>("/site-content", { revalidate: 15 });
  } catch {
    return {
      siteName,
      tagline: "Digital goods for Bangladesh",
      defaultSeoTitle: `${siteName} — Digital goods`,
      defaultSeoDescription: "Browse published digital products.",
      canonicalBaseUrl: storefront === "uniqbd" ? "https://uniqbd.com" : getSiteUrl(),
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
      logoAlt: siteName,
      lightLogoPath: logos.light,
      darkLogoPath: logos.dark,
      faviconPath: null,
      contact: DEFAULT_PUBLIC_CONTACT,
      navigation: [
        { id: "home", label: "Home", href: "/" },
        { id: "products", label: "Products", href: "/products" },
        { id: "search", label: "Search", href: "/search" },
      ],
    };
  }
});

export async function fetchHomepage() {
  return catalogFetch<{
    slides: Array<{
      id: string;
      title: string;
      subtitle: string | null;
      imageUrl: string;
      linkUrl: string | null;
    }>;
    sections: Array<{
      id: string;
      title: string;
      type: string;
      products: PublicProductSummary[];
    }>;
    site: PublicSiteContent;
  }>("/homepage");
}

export async function fetchCategories() {
  return catalogFetch<PublicCategory[]>("/categories");
}

export async function fetchCategory(slug: string) {
  return catalogFetch<PublicCategory>(`/categories/${encodeURIComponent(slug)}`, {
    revalidate: 15,
  });
}

export async function fetchBrands() {
  return catalogFetch<PublicBrand[]>("/brands");
}

export async function fetchBrand(slug: string) {
  return catalogFetch<PublicBrand>(`/brands/${encodeURIComponent(slug)}`, {
    revalidate: 15,
  });
}

export async function fetchProducts(searchParams: URLSearchParams) {
  const qs = searchParams.toString();
  return catalogFetch<PaginatedResult<PublicProductSummary>>(
    `/products${qs ? `?${qs}` : ""}`,
  );
}

export async function fetchProductReviews(slug: string) {
  try {
    return await catalogFetch<
      import("@amarpin/types").PublicProductReview[]
    >(`/products/${encodeURIComponent(slug)}/reviews`);
  } catch {
    return [];
  }
}

export async function fetchPublicReviews(searchParams: URLSearchParams) {
  const qs = searchParams.toString();
  return catalogFetch<PublicReviewFeed>(`/reviews${qs ? `?${qs}` : ""}`, { revalidate: 15 });
}

export async function fetchProduct(slug: string) {
  return catalogFetch<PublicProductDetail>(`/products/${encodeURIComponent(slug)}`, {
    revalidate: 15,
  });
}

export async function fetchSitemapEntries() {
  return catalogFetch<{
    products: Array<{ slug: string; updatedAt: string }>;
    categories: Array<{ slug: string; updatedAt: string }>;
    brands: Array<{ slug: string; updatedAt: string }>;
  }>("/seo/sitemap-entries", { revalidate: 15 });
}

export { formatPrice } from "./format";
