import type { Metadata } from "next";
import { ProductRequestForm } from "@/components/content/ProductRequestForm";
import { StorefrontShell } from "@/components/storefront/StorefrontShell";
import { fetchSiteContent } from "@/lib/catalog/api";
import { metadataForFixedRoute } from "@/lib/catalog/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const site = await fetchSiteContent();
  return metadataForFixedRoute(site, "REQUEST_PRODUCT", {
    title: `Request a product — ${site.siteName}`,
    description: "Ask AuGetway to stock a digital product.",
    path: "/request-product",
  });
}

export default async function RequestProductPage() {
  const site = await fetchSiteContent();
  return (
    <StorefrontShell site={site}>
      <section className="catalog-section">
        <h1>Request a product</h1>
        <p className="lead">
          Tell us what you need. Staff will review the request — email delivery
          status is tracked separately when a provider is configured.
        </p>
        <ProductRequestForm />
      </section>
    </StorefrontShell>
  );
}
