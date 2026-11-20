import type {
  ContactInquiryCreateResult,
  PaginatedResult,
  ProductRequestCreateResult,
  PublicBlogCategory,
  PublicBlogPostDetail,
  PublicBlogPostSummary,
  PublicSitePage,
  SitePageKeyPublic,
} from "@amarpin/types";
import { getApiBaseUrl } from "@/lib/auth/api-base";

export class ContentApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function contentFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
    next: init?.method && init.method !== "GET" ? undefined : { revalidate: 15 },
    cache: init?.method && init.method !== "GET" ? "no-store" : undefined,
  });
  if (!response.ok) {
    throw new ContentApiError(
      `Content request failed (${response.status})`,
      response.status,
    );
  }
  return (await response.json()) as T;
}

export async function fetchBlogCategories() {
  return contentFetch<PublicBlogCategory[]>("/content/blog/categories");
}

export async function fetchBlogCategory(slug: string) {
  return contentFetch<PublicBlogCategory>(
    `/content/blog/categories/${encodeURIComponent(slug)}`,
  );
}

export async function fetchBlogPosts(searchParams?: URLSearchParams) {
  const qs = searchParams?.toString();
  return contentFetch<PaginatedResult<PublicBlogPostSummary>>(
    `/content/blog/posts${qs ? `?${qs}` : ""}`,
  );
}

export async function fetchBlogPost(slug: string) {
  return contentFetch<PublicBlogPostDetail>(
    `/content/blog/posts/${encodeURIComponent(slug)}`,
  );
}

export async function fetchSitePage(key: string) {
  return contentFetch<PublicSitePage>(
    `/content/pages/${encodeURIComponent(key)}`,
  );
}

export async function fetchContentSitemapEntries() {
  return contentFetch<{
    blogPosts: Array<{ slug: string; updatedAt: string }>;
    blogCategories: Array<{ slug: string; updatedAt: string }>;
    pages: Array<{ path: string; updatedAt: string }>;
  }>("/content/seo/sitemap-entries");
}

export async function submitContact(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
}) {
  const response = await fetch("/api/content/contact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
  } & Partial<ContactInquiryCreateResult>;
  if (!response.ok) {
    const message = Array.isArray(payload.message)
      ? payload.message.join(", ")
      : payload.message || "Failed to send message";
    throw new Error(message);
  }
  return payload as ContactInquiryCreateResult;
}

export async function submitProductRequest(input: {
  productName: string;
  customerName: string;
  email: string;
  mobile: string;
  details: string;
}) {
  const response = await fetch("/api/content/product-requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
  } & Partial<ProductRequestCreateResult>;
  if (!response.ok) {
    const message = Array.isArray(payload.message)
      ? payload.message.join(", ")
      : payload.message || "Failed to submit request";
    throw new Error(message);
  }
  return payload as ProductRequestCreateResult;
}

export const SITE_PAGE_PATH: Record<SitePageKeyPublic, string> = {
  ABOUT: "/about",
  CONTACT: "/contact",
  PRIVACY: "/privacy-policy",
  TERMS: "/terms-conditions",
  REFUND_POLICY: "/refund-and-returns-policy",
  DISCLAIMERS: "/disclaimers",
};
