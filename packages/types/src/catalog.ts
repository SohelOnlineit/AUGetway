import { DEFAULT_CURRENCY } from "./index";

export type PublicProductStatus = "ACTIVE";

export interface PublicCatalogImage {
  id: string;
  url: string;
  alt: string | null;
  sortOrder: number;
}

export interface PublicCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  depth: number;
  imageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoImageUrl: string | null;
  noindex: boolean;
}

export interface PublicBrand {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoImageUrl: string | null;
  noindex: boolean;
}

export interface PublicProductSummary {
  id: string;
  title: string;
  slug: string;
  shortDescription: string | null;
  type: string;
  priceMinor: number;
  compareAtMinor: number | null;
  currency: typeof DEFAULT_CURRENCY | string;
  featured: boolean;
  primaryImage: PublicCatalogImage | null;
  category: Pick<PublicCategory, "id" | "name" | "slug">;
  brand: Pick<PublicBrand, "id" | "name" | "slug"> | null;
  /** Approved reviews only. */
  ratingCount: number;
  ratingAverage: number | null;
  /** Storefront region photos. Empty when the product has no region images. */
  regionImages: PublicRegionImage[];
  /** Saved variation packages. */
  packageCount: number;
}

export interface PublicProductPackage {
  valueId: string;
  name: string;
  priceMinor: number;
  region: string | null;
  regions: string[];
  imageUrl: string | null;
  inStock: boolean;
  availableCount: number;
  instant: boolean;
}

export interface PublicRegionImage {
  region: string;
  imageUrl: string;
}

export interface PublicCustomerInput {
  id: string;
  label: string;
  placeholder: string;
  required: boolean;
}

export interface PublicProductDetail extends PublicProductSummary {
  description: string | null;
  images: PublicCatalogImage[];
  seoTitle: string | null;
  seoDescription: string | null;
  seoImageUrl: string | null;
  keywords: string | null;
  canonicalPath: string | null;
  noindex: boolean;
  nofollow: boolean;
  publishedAt: string | null;
  regions: string[];
  defaultRegion: string | null;
  regionImages: PublicRegionImage[];
  packages: PublicProductPackage[];
  customerInputs: PublicCustomerInput[];
}

export interface PublicHomepageSlide {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  linkUrl: string | null;
  sortOrder: number;
}

export interface PublicHomepageSection {
  id: string;
  title: string;
  type: string;
  products: PublicProductSummary[];
}

export interface PublicNavigationItem {
  id: string;
  label: string;
  href: string;
}

export type PublicRouteSeoKey = "HOME" | "PRODUCTS" | "BLOG" | "REQUEST_PRODUCT";

export interface PublicRouteSeo {
  key: PublicRouteSeoKey;
  path: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  canonicalPath: string | null;
  noindex: boolean;
  nofollow: boolean;
}

export const SEO_VERIFIERS = [
  { id: "google", label: "Google Search Console", meta: "google-site-verification", href: "https://search.google.com/search-console" },
  { id: "bing", label: "Bing Webmaster", meta: "msvalidate.01", href: "https://www.bing.com/webmasters" },
  { id: "yandex", label: "Yandex Webmaster", meta: "yandex-verification", href: "https://webmaster.yandex.com" },
  { id: "pinterest", label: "Pinterest", meta: "p:domain_verify", href: "https://www.pinterest.com/settings/claim" },
  { id: "facebook", label: "Facebook", meta: "facebook-domain-verification", href: "https://business.facebook.com" },
  { id: "naver", label: "Naver Search Advisor", meta: "naver-site-verification", href: "https://searchadvisor.naver.com" },
  { id: "other", label: "Other site", meta: "", href: "" },
] as const;

export type SeoVerifierId = (typeof SEO_VERIFIERS)[number]["id"];

export interface SeoVerificationLink {
  provider: SeoVerifierId;
  name: string | null;
  code: string;
}

export interface PublicContactDetails {
  phone: string;
  address: string;
  whatsapp: string;
  whatsappUrl: string;
}

export const DEFAULT_PUBLIC_CONTACT: PublicContactDetails = {
  phone: "01777139777",
  address: "House 13, Road01, Block C, Po Nishatnagar Razabari, Turag, Dhaka 1711",
  whatsapp: "01777139777",
  whatsappUrl: "https://wa.me/8801777139777",
};

export interface PublicSiteContent {
  siteName: string;
  tagline: string | null;
  defaultSeoTitle: string | null;
  defaultSeoDescription: string | null;
  canonicalBaseUrl: string | null;
  /** Extra robots.txt lines from admin (never override core disallow rules). */
  robotsExtra: string | null;
  defaultOgImageUrl: string | null;
  indexing: boolean;
  titleSuffix: string | null;
  twitterHandle: string | null;
  googleSiteVerification: string | null;
  bingSiteVerification: string | null;
  ogLocale: string;
  sameAs: string[];
  verifications: SeoVerificationLink[];
  routeSeo: PublicRouteSeo[];
  logoAlt: string;
  lightLogoPath: string | null;
  darkLogoPath: string | null;
  faviconPath: string | null;
  contact: PublicContactDetails;
  navigation: PublicNavigationItem[];
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
