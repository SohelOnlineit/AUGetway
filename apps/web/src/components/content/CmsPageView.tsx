import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { RichHtml } from "@/components/content/RichHtml";
import { StorefrontShell } from "@/components/storefront/StorefrontShell";
import {
  ContentApiError,
  fetchSitePage,
} from "@/lib/content/api";
import { fetchSiteContent } from "@/lib/catalog/api";
import {
  breadcrumbJsonLd,
  buildPageMetadata,
  jsonLdHtml,
  resolveSiteOrigin,
} from "@/lib/catalog/seo";

export async function buildCmsPageMetadata(
  key: string,
  path: string,
): Promise<Metadata> {
  const site = await fetchSiteContent();
  try {
    const page = await fetchSitePage(key);
    return buildPageMetadata(
      {
        title: page.seoTitle || `${page.title} — ${site.siteName}`,
        description: page.seoDescription,
        path,
        imageUrl: page.seoImageUrl,
        index: !page.noindex,
      },
      site,
    );
  } catch {
    return buildPageMetadata(
      {
        title: `Page not found — ${site.siteName}`,
        path,
        index: false,
        follow: false,
      },
      site,
    );
  }
}

export async function CmsPageView({
  pageKey,
  path,
  children,
}: {
  pageKey: string;
  path: string;
  children?: ReactNode;
}) {
  const site = await fetchSiteContent();
  let page;
  try {
    page = await fetchSitePage(pageKey);
  } catch (error) {
    if (error instanceof ContentApiError && error.status === 404) notFound();
    // Unpublished or API offline — do not fail the whole build.
    notFound();
  }

  const crumbs = breadcrumbJsonLd(
    [
      { name: "Home", path: "/" },
      { name: page.title, path },
    ],
    resolveSiteOrigin(site),
  );

  return (
    <StorefrontShell site={site}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(crumbs) }}
      />
      <article className="catalog-section prose-block">
        <h1>{page.title}</h1>
        <RichHtml className="cms-body rich-html" html={page.body} />
        {children}
      </article>
    </StorefrontShell>
  );
}
