import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import type { PublicProductSummary } from "@amarpin/types";
import { HomePosterSlider } from "@/components/storefront/HomePosterSlider";
import { HomeProductCard } from "@/components/storefront/HomeProductCard";
import { StorefrontShell } from "@/components/storefront/StorefrontShell";
import {
  CatalogApiError,
  fetchHomepage,
  fetchSiteContent,
} from "@/lib/catalog/api";
import {
  jsonLdHtml,
  metadataForFixedRoute,
  organizationJsonLd,
  publicAssetUrl,
  resolveSiteOrigin,
  websiteJsonLd,
} from "@/lib/catalog/seo";

export const revalidate = 60;

function sectionHref(products: PublicProductSummary[]) {
  const slugs = new Set(products.map((product) => product.category.slug));
  if (slugs.size === 1) {
    const slug = products[0]?.category.slug;
    if (slug) return `/category/${slug}`;
  }
  return "/products";
}

export async function generateMetadata(): Promise<Metadata> {
  const site = await fetchSiteContent();
  return metadataForFixedRoute(site, "HOME", {
    title: site.defaultSeoTitle || site.siteName,
    description:
      site.defaultSeoDescription || site.tagline || "Browse published digital products on AuGetway.",
    path: "/",
  });
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}

function HomeSkeleton() {
  return (
    <div className="storefront">
      <div className="storefront-main">
        <div className="home-hero home-skeleton-pulse" aria-hidden />
        <div className="home-product-row">
          {Array.from({ length: 12 }, (_, index) => (
            <div key={index} className="catalog-tile home-skeleton-card home-skeleton-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}

async function HomeContent() {
  const sitePromise = fetchSiteContent();
  let data: Awaited<ReturnType<typeof fetchHomepage>> | null = null;
  let loadError: string | null = null;

  try {
    data = await fetchHomepage();
  } catch (error) {
    loadError =
      error instanceof CatalogApiError
        ? "Catalog API is unavailable right now."
        : "Unable to load homepage.";
  }
  const site = data?.site ?? (await sitePromise);

  if (!data) {
    return (
      <StorefrontShell site={site}>
        <section className="card">
          <h1>{site.siteName}</h1>
          <p className="lead">{loadError}</p>
          <p className="auth-links">
            <Link href="/products">Try products</Link>
          </p>
        </section>
      </StorefrontShell>
    );
  }

  const origin = resolveSiteOrigin(data.site);
  const org = organizationJsonLd({
    siteName: data.site.siteName,
    description: data.site.defaultSeoDescription || data.site.tagline,
    origin,
    sameAs: data.site.sameAs,
    logo: publicAssetUrl(origin, data.site.defaultOgImageUrl),
  });
  const website = websiteJsonLd({ siteName: data.site.siteName, origin });

  return (
    <StorefrontShell site={data.site}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(org) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(website) }}
      />
      <HomePosterSlider slides={data.slides} />

      {data.sections.map((section) => (
        <section key={section.id} className="home-section">
          <div className="home-section-head">
            <h2>{section.title}</h2>
            <Link href={sectionHref(section.products)}>All</Link>
          </div>
          <div className="home-product-row">
            {section.products.map((product) => (
              <HomeProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ))}
    </StorefrontShell>
  );
}
