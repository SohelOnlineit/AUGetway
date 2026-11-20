import type { Metadata } from "next";
import { InfiniteProductGrid } from "@/components/storefront/InfiniteProductGrid";
import { StorefrontShell } from "@/components/storefront/StorefrontShell";
import { fetchProducts, fetchSiteContent } from "@/lib/catalog/api";
import { catalogQuery } from "@/lib/catalog/product-page";
import { buildPageMetadata } from "@/lib/catalog/seo";

export const revalidate = 30;

export async function generateMetadata(): Promise<Metadata> {
  const site = await fetchSiteContent();
  return buildPageMetadata(
    {
      title: `Search — ${site.siteName}`,
      description: "Search published catalog products.",
      path: "/search",
      index: false,
      follow: true,
    },
    site,
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const { first, rest } = catalogQuery(raw);
  const q = first.get("q") ?? "";

  const [site, products] = await Promise.all([
    fetchSiteContent(),
    fetchProducts(first),
  ]);

  return (
    <StorefrontShell site={site}>
      <section className="card">
        <h1>Search</h1>
        <form className="search-form" action="/search" method="get">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search published products"
            aria-label="Search products"
          />
          <button type="submit">Search</button>
        </form>
      </section>
      <InfiniteProductGrid
        products={products.items}
        total={products.total}
        query={rest}
        emptyMessage={
          q
            ? `No published products matched “${q}”.`
            : "Enter a query to search the published catalog."
        }
      />
    </StorefrontShell>
  );
}
