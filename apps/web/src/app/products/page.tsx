import type { Metadata } from "next";
import { InfiniteProductGrid } from "@/components/storefront/InfiniteProductGrid";
import { StorefrontShell } from "@/components/storefront/StorefrontShell";
import { fetchProducts, fetchSiteContent } from "@/lib/catalog/api";
import { catalogQuery } from "@/lib/catalog/product-page";
import { metadataForFixedRoute } from "@/lib/catalog/seo";

export const revalidate = 60;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const raw = await searchParams;
  const hasQuery = Object.values(raw).some((value) =>
    Array.isArray(value) ? value.some(Boolean) : Boolean(value),
  );
  const site = await fetchSiteContent();
  return metadataForFixedRoute(
    site,
    "PRODUCTS",
    {
      title: `Products — ${site.siteName}`,
      description: site.defaultSeoDescription || "Browse published digital products.",
      path: "/products",
    },
    { index: hasQuery ? false : undefined },
  );
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const { first, rest } = catalogQuery(raw);

  const [site, products] = await Promise.all([
    fetchSiteContent(),
    fetchProducts(first),
  ]);

  return (
    <StorefrontShell site={site}>
      <section className="catalog-section">
        <div>
          <InfiniteProductGrid
            products={products.items}
            total={products.total}
            query={rest}
            className="product-grid-6"
          />
        </div>
      </section>
    </StorefrontShell>
  );
}
