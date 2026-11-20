import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InfiniteProductGrid } from "@/components/storefront/InfiniteProductGrid";
import { StorefrontShell } from "@/components/storefront/StorefrontShell";
import {
  CatalogApiError,
  fetchCategory,
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
    const category = await fetchCategory(slug);
    return buildPageMetadata(
      {
        title: category.seoTitle || `${category.name} — ${site.siteName}`,
        description: category.seoDescription || category.description,
        path: `/category/${category.slug}`,
        imageUrl: category.seoImageUrl || category.imageUrl,
        index: !category.noindex,
      },
      site,
    );
  } catch {
    return buildPageMetadata(
      {
        title: `Category not found — ${site.siteName}`,
        path: `/category/${slug}`,
        index: false,
        follow: false,
      },
      site,
    );
  }
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const raw = await searchParams;
  const { first, rest } = catalogQuery(raw, { category: slug });

  const site = await fetchSiteContent();
  let category;
  try {
    category = await fetchCategory(slug);
  } catch (error) {
    if (error instanceof CatalogApiError && error.status === 404) notFound();
    throw error;
  }

  const products = await fetchProducts(first);

  return (
    <StorefrontShell site={site}>
      <section className="card">
        <h1>{category.name}</h1>
        {category.description ? (
          <p className="lead">{category.description}</p>
        ) : (
          <p className="lead">Published products in this category.</p>
        )}
      </section>
      <InfiniteProductGrid
        products={products.items}
        total={products.total}
        query={rest}
        emptyMessage="No published products in this category yet."
      />
    </StorefrontShell>
  );
}
