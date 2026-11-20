import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InfiniteProductGrid } from "@/components/storefront/InfiniteProductGrid";
import { StorefrontShell } from "@/components/storefront/StorefrontShell";
import {
  CatalogApiError,
  fetchBrand,
  fetchProducts,
  fetchSiteContent,
} from "@/lib/catalog/api";
import { catalogQuery } from "@/lib/catalog/product-page";
import { buildPageMetadata } from "@/lib/catalog/seo";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = await fetchSiteContent();
  try {
    const brand = await fetchBrand(slug);
    return buildPageMetadata(
      {
        title: brand.seoTitle || `${brand.name} — ${site.siteName}`,
        description: brand.seoDescription || brand.description,
        path: `/brand/${brand.slug}`,
        imageUrl: brand.seoImageUrl || brand.logoUrl,
        index: !brand.noindex,
      },
      site,
    );
  } catch {
    return buildPageMetadata(
      {
        title: `Brand not found — ${site.siteName}`,
        path: `/brand/${slug}`,
        index: false,
        follow: false,
      },
      site,
    );
  }
}

export default async function BrandPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const raw = await searchParams;
  const { first, rest } = catalogQuery(raw, { brand: slug });

  const site = await fetchSiteContent();
  let brand;
  try {
    brand = await fetchBrand(slug);
  } catch (error) {
    if (error instanceof CatalogApiError && error.status === 404) notFound();
    throw error;
  }

  const products = await fetchProducts(first);

  return (
    <StorefrontShell site={site}>
      <section className="card">
        <h1>{brand.name}</h1>
        {brand.description ? (
          <p className="lead">{brand.description}</p>
        ) : (
          <p className="lead">Published products from this brand.</p>
        )}
      </section>
      <InfiniteProductGrid
        products={products.items}
        total={products.total}
        query={rest}
        emptyMessage="No published products for this brand yet."
      />
    </StorefrontShell>
  );
}
