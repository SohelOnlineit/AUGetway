import type { Metadata } from "next";
import type { PublicReviewFeed } from "@amarpin/types";
import { ReviewCenter } from "@/components/catalog/ReviewCenter";
import { StorefrontShell } from "@/components/storefront/StorefrontShell";
import { fetchPublicReviews, fetchSiteContent } from "@/lib/catalog/api";
import { breadcrumbJsonLd, jsonLdHtml, resolveSiteOrigin } from "@/lib/catalog/seo";

export const dynamic = "force-dynamic";

const EMPTY_FEED: PublicReviewFeed = {
  total: 0,
  page: 1,
  pageSize: 12,
  pageCount: 1,
  reviews: [],
  categories: [],
  products: [],
};

function one(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ?? "";
}

export async function generateMetadata(): Promise<Metadata> {
  const site = await fetchSiteContent();
  return {
    title: `Reviews — ${site.siteName}`,
    description: `Read verified customer reviews across ${site.siteName} digital products and categories.`,
  };
}

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const site = await fetchSiteContent();
  const params = await searchParams;
  const filters = {
    q: one(params.q),
    category: one(params.category),
    product: one(params.product),
    page: Math.max(1, Number.parseInt(one(params.page) || "1", 10) || 1),
  };
  const query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  if (filters.category) query.set("category", filters.category);
  if (filters.product) query.set("product", filters.product);
  if (filters.page > 1) query.set("page", String(filters.page));

  let feed = EMPTY_FEED;
  try {
    feed = await fetchPublicReviews(query);
  } catch {
    feed = EMPTY_FEED;
  }

  const origin = resolveSiteOrigin(site);
  const crumbs = breadcrumbJsonLd(
    [
      { name: "Home", path: "/" },
      { name: "Reviews", path: "/reviews" },
    ],
    origin,
  );

  return (
    <StorefrontShell site={site}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(crumbs) }} />
      <ReviewCenter feed={feed} filters={filters} />
    </StorefrontShell>
  );
}
