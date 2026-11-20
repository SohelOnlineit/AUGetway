import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogCenter } from "@/components/blog/BlogCenter";
import { StorefrontShell } from "@/components/storefront/StorefrontShell";
import { fetchSiteContent } from "@/lib/catalog/api";
import {
  breadcrumbJsonLd,
  buildPageMetadata,
  jsonLdHtml,
  resolveSiteOrigin,
} from "@/lib/catalog/seo";
import {
  ContentApiError,
  fetchBlogCategories,
  fetchBlogCategory,
  fetchBlogPosts,
} from "@/lib/content/api";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = await fetchSiteContent();
  try {
    const category = await fetchBlogCategory(slug);
    return buildPageMetadata(
      {
        title: category.seoTitle || `${category.name} — ${site.siteName}`,
        description: category.seoDescription || category.description,
        path: `/blog/category/${category.slug}`,
        imageUrl: category.seoImageUrl,
        index: !category.noindex,
      },
      site,
    );
  } catch {
    return buildPageMetadata(
      {
        title: `Category not found — ${site.siteName}`,
        path: `/blog/category/${slug}`,
        index: false,
        follow: false,
      },
      site,
    );
  }
}

export default async function BlogCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const site = await fetchSiteContent();
  let category;
  try {
    category = await fetchBlogCategory(slug);
  } catch (error) {
    if (error instanceof ContentApiError && error.status === 404) notFound();
    throw error;
  }

  const [posts, categories] = await Promise.all([
    fetchBlogPosts(
      new URLSearchParams({
        page: "1",
        pageSize: "24",
        category: category.slug,
      }),
    ),
    fetchBlogCategories().catch(() => []),
  ]);

  const crumbs = breadcrumbJsonLd(
    [
      { name: "Home", path: "/" },
      { name: "Blog", path: "/blog" },
      { name: category.name, path: `/blog/category/${category.slug}` },
    ],
    resolveSiteOrigin(site),
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
        activeSlug={category.slug}
      />
    </StorefrontShell>
  );
}
