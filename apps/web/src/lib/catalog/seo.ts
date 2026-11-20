import type { Metadata } from "next";
import type { PublicRouteSeoKey, PublicSiteContent } from "@amarpin/types";
import { getSiteUrl } from "./api";
import { productPublicPath } from "./paths";

type SiteSeo = Pick<
  PublicSiteContent,
  | "siteName"
  | "tagline"
  | "defaultSeoTitle"
  | "defaultSeoDescription"
  | "canonicalBaseUrl"
  | "defaultOgImageUrl"
  | "indexing"
  | "twitterHandle"
  | "ogLocale"
  | "routeSeo"
> | null;

export function resolveSiteOrigin(site?: { canonicalBaseUrl?: string | null } | null) {
  const raw = site?.canonicalBaseUrl?.trim();
  if (raw) {
    try {
      const url = new URL(raw);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return url.origin;
      }
    } catch {
      /* fall back to the environment site URL */
    }
  }
  return getSiteUrl();
}

function absoluteUrl(origin: string, path: string) {
  const clean = (path.startsWith("/") ? path : `/${path}`).split("?")[0]?.split("#")[0] || "/";
  return `${origin}${clean === "/" ? "/" : clean}`;
}

export function publicAssetUrl(origin: string, imageUrl?: string | null) {
  return absoluteImage(origin, imageUrl);
}

function absoluteImage(origin: string, imageUrl?: string | null) {
  const raw = imageUrl?.trim();
  if (!raw) return undefined;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/")) return `${origin}${raw}`;
  return undefined;
}

export function buildPageMetadata(
  input: {
    title: string;
    description?: string | null;
    path: string;
    imageUrl?: string | null;
    keywords?: string | null;
    /** Default true for public catalog pages. */
    index?: boolean;
    follow?: boolean;
    ogType?: "website" | "article";
  },
  site?: SiteSeo,
): Metadata {
  const origin = resolveSiteOrigin(site);
  const canonical = absoluteUrl(origin, input.path);
  const description =
    input.description?.trim() ||
    site?.defaultSeoDescription?.trim() ||
    site?.tagline?.trim() ||
    "Browse published digital products on AuGetway.";
  const index = input.index !== false && site?.indexing !== false;
  const follow = input.follow !== false && site?.indexing !== false;
  const siteName = site?.siteName?.trim() || "AuGetway";
  const image = absoluteImage(origin, input.imageUrl || site?.defaultOgImageUrl);
  const title = input.title.trim() || site?.defaultSeoTitle?.trim() || siteName;

  const keywords = input.keywords
    ?.split(",")
    .map((word) => word.trim())
    .filter(Boolean);
  return {
    title,
    description,
    ...(keywords?.length ? { keywords } : {}),
    alternates: { canonical },
    robots: {
      index,
      follow,
      googleBot: { index, follow },
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName,
      type: input.ogType ?? "website",
      locale: site?.ogLocale || "en_US",
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(site?.twitterHandle ? { site: `@${site.twitterHandle}` } : {}),
      ...(image ? { images: [image] } : {}),
    },
  };
}

export function metadataForFixedRoute(
  site: PublicSiteContent,
  key: PublicRouteSeoKey,
  fallback: { title: string; description: string; path: string },
  options?: { index?: boolean },
): Metadata {
  const route = site.routeSeo.find((item) => item.key === key);
  return buildPageMetadata(
    {
      title: route?.title?.trim() || fallback.title,
      description: route?.description?.trim() || fallback.description,
      path: route?.canonicalPath || fallback.path,
      imageUrl: route?.imageUrl || site.defaultOgImageUrl,
      index: options?.index === false ? false : !route?.noindex,
      follow: !route?.nofollow,
    },
    site,
  );
}

export function metadataForCms(
  site: PublicSiteContent,
  page: {
    title: string;
    seoTitle: string | null;
    seoDescription: string | null;
    seoImageUrl: string | null;
    noindex: boolean;
  } | null,
  path: string,
  fallbackTitle: string,
): Metadata {
  if (!page) {
    return buildPageMetadata(
      { title: fallbackTitle, path, index: false, follow: false },
      site,
    );
  }
  return buildPageMetadata(
    {
      title: page.seoTitle?.trim() || `${page.title} — ${site.siteName}`,
      description: page.seoDescription,
      path,
      imageUrl: page.seoImageUrl,
      index: !page.noindex,
    },
    site,
  );
}

export function buildNoIndexMetadata(input: {
  title: string;
  path: string;
  description?: string;
}): Metadata {
  return buildPageMetadata({
    title: input.title,
    description: input.description ?? "Private AuGetway account area.",
    path: input.path,
    index: false,
    follow: false,
  });
}

export function jsonLdHtml(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function organizationJsonLd(input: {
  siteName: string;
  description?: string | null;
  origin?: string;
  sameAs?: string[];
  logo?: string | null;
}) {
  const siteUrl = input.origin ?? getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: input.siteName,
    url: siteUrl,
    description: input.description ?? undefined,
    logo: input.logo || undefined,
    sameAs: input.sameAs?.length ? input.sameAs : undefined,
  };
}

export function websiteJsonLd(input: { siteName: string; origin?: string }) {
  const siteUrl = input.origin ?? getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: input.siteName,
    url: siteUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbJsonLd(
  items: Array<{ name: string; path: string }>,
  origin?: string,
) {
  const siteUrl = origin ?? getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(siteUrl, item.path),
    })),
  };
}

export function productJsonLd(input: {
  name: string;
  description?: string | null;
  slug: string;
  priceMinor: number;
  currency: string;
  imageUrl?: string | null;
  ratingCount?: number;
  ratingAverage?: number | null;
  origin?: string;
}) {
  const siteUrl = input.origin ?? getSiteUrl();
  const image = absoluteImage(siteUrl, input.imageUrl);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: input.description ?? undefined,
    url: `${siteUrl}${productPublicPath(input.slug)}`,
    ...(image ? { image } : {}),
    offers: {
      "@type": "Offer",
      priceCurrency: input.currency,
      price: (input.priceMinor / 100).toFixed(2),
      url: `${siteUrl}${productPublicPath(input.slug)}`,
    },
    ...(input.ratingCount && input.ratingCount > 0 && input.ratingAverage
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: input.ratingAverage,
            reviewCount: input.ratingCount,
          },
        }
      : {}),
  };
}
