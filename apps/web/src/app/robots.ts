import type { MetadataRoute } from "next";
import { fetchSiteContent } from "@/lib/catalog/api";
import { resolveSiteOrigin } from "@/lib/catalog/seo";

/** Private / transactional paths must never be offered for crawling. */
const DISALLOW = [
  "/admin",
  "/admin/",
  "/dashboard",
  "/dashboard/",
  "/api/",
  "/cart",
  "/checkout",
  "/orders",
  "/refunds",
  "/tickets",
  "/chat",
  "/wallet",
  "/wishlist",
  "/profile",
  "/settings",
  "/notifications",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
] as const;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = await fetchSiteContent().catch(() => null);
  if (site?.indexing === false) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  const siteUrl = resolveSiteOrigin(site);
  let extra: string[] = [];
  if (site?.robotsExtra?.trim()) {
    extra = site.robotsExtra
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => (/^disallow:\s+/i.test(line) ? line.replace(/^disallow:\s+/i, "").trim() : line))
      .map((path) => path.split("?")[0]?.split("#")[0] ?? "")
      .filter((path) => path.startsWith("/") && path !== "/" && !path.includes("..") && /^\/[A-Za-z0-9._~/-]*$/.test(path));
  }

  const disallow = [...new Set([...DISALLOW, ...extra])];

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow,
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
