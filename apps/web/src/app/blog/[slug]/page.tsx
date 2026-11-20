import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
  fetchBlogPost,
} from "@/lib/content/api";
import { formatBangladeshDate } from "@/lib/datetime";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = await fetchSiteContent();
  try {
    const post = await fetchBlogPost(slug);
    return buildPageMetadata(
      {
        title: post.seoTitle || `${post.title} — ${site.siteName}`,
        description: post.seoDescription || post.excerpt,
        path: `/blog/${post.slug}`,
        imageUrl: post.seoImageUrl || post.coverImagePath,
        index: !post.noindex,
        ogType: "article",
      },
      site,
    );
  } catch {
    return buildPageMetadata(
      {
        title: `Post not found — ${site.siteName}`,
        path: `/blog/${slug}`,
        index: false,
        follow: false,
      },
      site,
    );
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const site = await fetchSiteContent();
  let post;
  try {
    post = await fetchBlogPost(slug);
  } catch (error) {
    if (error instanceof ContentApiError && error.status === 404) notFound();
    throw error;
  }

  const origin = resolveSiteOrigin(site);
  const imagePath = post.seoImageUrl || post.coverImagePath;
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.seoDescription || post.excerpt || undefined,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    ...(imagePath
      ? {
          image: imagePath.startsWith("http") ? imagePath : `${origin}${imagePath}`,
        }
      : {}),
    ...(post.authorDisplayName
      ? { author: { "@type": "Person", name: post.authorDisplayName } }
      : { author: { "@type": "Organization", name: site.siteName } }),
    mainEntityOfPage: `${origin}/blog/${post.slug}`,
  };
  const crumbs = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
    ...(post.category
      ? [
          {
            name: post.category.name,
            path: `/blog/category/${post.category.slug}`,
          },
        ]
      : []),
    { name: post.title, path: `/blog/${post.slug}` },
  ], origin);

  return (
    <StorefrontShell site={site}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(articleLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(crumbs) }}
      />
      <article className="catalog-section prose-block">
        {post.coverImagePath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.coverImagePath} alt="" className="blog-cover" />
        ) : null}
        <p className="eyebrow">
          <Link href="/blog">Blog</Link>
          {post.category ? (
            <>
              {" · "}
              <Link href={`/blog/category/${post.category.slug}`}>
                {post.category.name}
              </Link>
            </>
          ) : null}
        </p>
        <h1>{post.title}</h1>
        <p className="lead">
          {formatBangladeshDate(post.publishedAt)}
          {post.authorDisplayName ? ` · ${post.authorDisplayName}` : ""}
        </p>
        <div className="cms-body">
          {post.body
            .split(/\n{2,}/)
            .map((block) => block.trim())
            .filter(Boolean)
            .map((block) => (
              <p key={block.slice(0, 64)}>{block}</p>
            ))}
        </div>
      </article>
    </StorefrontShell>
  );
}
