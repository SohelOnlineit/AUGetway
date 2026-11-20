import type { MetadataRoute } from "next";
import { fetchSitemapEntries, fetchSiteContent } from "@/lib/catalog/api";
import { resolveSiteOrigin } from "@/lib/catalog/seo";
import { fetchContentSitemapEntries } from "@/lib/content/api";

/**
 * Public indexable routes only.
 * Draft/archived products, unpublished CMS pages, and draft blog posts are excluded by APIs.
 * Account, checkout, admin, and auth paths are intentionally omitted.
 */
const FIXED: Array<{
  key: "HOME" | "PRODUCTS" | "BLOG" | "REQUEST_PRODUCT";
  path: string;
  changeFrequency: "daily" | "monthly";
  priority: number;
}> = [
  { key: "HOME", path: "/", changeFrequency: "daily", priority: 1 },
  { key: "PRODUCTS", path: "/products", changeFrequency: "daily", priority: 0.9 },
  { key: "BLOG", path: "/blog", changeFrequency: "daily", priority: 0.7 },
  { key: "REQUEST_PRODUCT", path: "/request-product", changeFrequency: "monthly", priority: 0.4 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = await fetchSiteContent();
  if (site.indexing === false) return [];
  const siteUrl = resolveSiteOrigin(site);
  const staticRoutes: MetadataRoute.Sitemap = FIXED.filter((item) => {
    const row = site.routeSeo.find((route) => route.key === item.key);
    return !row?.noindex;
  }).map((item) => ({
    url: `${siteUrl}${item.path === "/" ? "/" : item.path}`,
    changeFrequency: item.changeFrequency,
    priority: item.priority,
  }));

  try {
    const [entries, content] = await Promise.all([
      fetchSitemapEntries(),
      fetchContentSitemapEntries().catch(() => ({
        blogPosts: [],
        blogCategories: [],
        pages: [],
      })),
    ]);
    return [
      ...staticRoutes,
      ...entries.categories.map((item) => ({
        url: `${siteUrl}/category/${item.slug}`,
        lastModified: new Date(item.updatedAt),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
      ...entries.brands.map((item) => ({
        url: `${siteUrl}/brand/${item.slug}`,
        lastModified: new Date(item.updatedAt),
        changeFrequency: "weekly" as const,
        priority: 0.6,
      })),
      ...entries.products.map((item) => ({
        url: `${siteUrl}/${item.slug}`,
        lastModified: new Date(item.updatedAt),
        changeFrequency: "daily" as const,
        priority: 0.8,
      })),
      ...content.blogCategories.map((item) => ({
        url: `${siteUrl}/blog/category/${item.slug}`,
        lastModified: new Date(item.updatedAt),
        changeFrequency: "weekly" as const,
        priority: 0.5,
      })),
      ...content.blogPosts.map((item) => ({
        url: `${siteUrl}/blog/${item.slug}`,
        lastModified: new Date(item.updatedAt),
        changeFrequency: "weekly" as const,
        priority: 0.6,
      })),
      ...content.pages.map((item) => ({
        url: `${siteUrl}${item.path}`,
        lastModified: new Date(item.updatedAt),
        changeFrequency: "monthly" as const,
        priority: 0.4,
      })),
    ];
  } catch {
    return staticRoutes;
  }
}
