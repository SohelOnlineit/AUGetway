import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetail } from "@/components/catalog/ProductDetail";
import { StorefrontShell } from "@/components/storefront/StorefrontShell";
import { viewerIsAdministrator } from "@/lib/auth/viewer";
import {
  CatalogApiError,
  fetchProduct,
  fetchProductReviews,
  fetchSiteContent,
} from "@/lib/catalog/api";
import { hideOutOfStockPackages } from "@/lib/catalog/regions";
import { productPublicPath } from "@/lib/catalog/paths";
import {
  breadcrumbJsonLd,
  buildPageMetadata,
  jsonLdHtml,
  productJsonLd,
  resolveSiteOrigin,
} from "@/lib/catalog/seo";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = await fetchSiteContent();
  try {
    const product = await fetchProduct(slug);
    return buildPageMetadata(
      {
        title: product.seoTitle || `${product.title} — ${site.siteName}`,
        description: product.seoDescription || product.shortDescription,
        path: product.canonicalPath || productPublicPath(product.slug),
        imageUrl: product.seoImageUrl || product.primaryImage?.url,
        keywords: product.keywords,
        index: !product.noindex,
        follow: !product.nofollow,
      },
      site,
    );
  } catch {
    return buildPageMetadata(
      {
        title: `Product not found — ${site.siteName}`,
        path: productPublicPath(slug),
        index: false,
        follow: false,
      },
      site,
    );
  }
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ region?: string; cartError?: string }>;
}) {
  const { slug } = await params;
  const { region, cartError } = await searchParams;
  const site = await fetchSiteContent();

  let product;
  try {
    product = await fetchProduct(slug);
  } catch (error) {
    if (error instanceof CatalogApiError && error.status === 404) notFound();
    throw error;
  }

  const reviews = await fetchProductReviews(product.slug);
  const administrator = await viewerIsAdministrator();
  const shown = administrator ? product : hideOutOfStockPackages(product);

  const origin = resolveSiteOrigin(site);
  const path = productPublicPath(product.slug);
  const jsonLd = productJsonLd({
    name: product.title,
    description: product.seoDescription || product.shortDescription,
    slug: product.slug,
    priceMinor: product.priceMinor,
    currency: product.currency,
    imageUrl: product.seoImageUrl || product.primaryImage?.url,
    ratingCount: product.ratingCount,
    ratingAverage: product.ratingAverage,
    origin,
  });
  const crumbs = breadcrumbJsonLd(
    [
      { name: "Home", path: "/" },
      { name: "Products", path: "/products" },
      { name: product.category.name, path: `/category/${product.category.slug}` },
      { name: product.title, path },
    ],
    origin,
  );

  return (
    <StorefrontShell site={site}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(crumbs) }}
      />
      <ProductDetail
        product={shown}
        reviews={reviews}
        preferredRegion={region}
        keepEmptyPackages={product.packages.length > 0}
        cartError={cartError?.trim().slice(0, 160) || null}
      />
    </StorefrontShell>
  );
}
