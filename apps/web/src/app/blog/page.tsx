import type { Metadata } from "next";
import { StorefrontShell } from "@/components/storefront/StorefrontShell";
import { fetchSiteContent } from "@/lib/catalog/api";
import {
  breadcrumbJsonLd,
  jsonLdHtml,
  metadataForFixedRoute,
  resolveSiteOrigin,
} from "@/lib/catalog/seo";
import { BlogCenter } from "@/components/blog/BlogCenter";
import { fetchBlogCategories, fetchBlogPosts } from "@/lib/content/api";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const site = await fetchSiteContent();
  return metadataForFixedRoute(site, "BLOG", {
    title: `Blog — ${site.siteName}`,
    description: `Guides, product news, and digital shopping tips from the ${site.siteName} team.`,
    path: "/blog",
  });
}

export default async function BlogIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const site = await fetchSiteContent();
  const params = await searchParams;
  const rawQuery = params.q;
  const query = (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery)?.trim() ?? "";
  let posts: Awaited<ReturnType<typeof fetchBlogPosts>> = {
    items: [],
    total: 0,
    page: 1,
    pageSize: 24,
    totalPages: 1,
  };
  let categories: Awaited<ReturnType<typeof fetchBlogCategories>> = [];
  try {
    [posts, categories] = await Promise.all([
      fetchBlogPosts(new URLSearchParams({ page: "1", pageSize: "24", ...(query ? { q: query } : {}) })),
      fetchBlogCategories(),
    ]);
  } catch {
    // API may be offline during local builds — keep page renderable.
  }

  const origin = resolveSiteOrigin(site);
  const crumbs = breadcrumbJsonLd(
    [
      { name: "Home", path: "/" },
      { name: "Blog", path: "/blog" },
    ],
    origin,
  );

  return (
    <StorefrontShell site={site}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(crumbs) }}
      />
      <BlogCenter
        siteName={site.siteName}
        categories={categories}
        posts={posts.items}
        query={query}
      />
    </StorefrontShell>
  );
}
