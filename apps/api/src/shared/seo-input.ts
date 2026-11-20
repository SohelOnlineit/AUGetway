import { BadRequestException } from "@nestjs/common";

const MEDIA_PATH = /^\/api\/content\/media\/[a-f0-9]{32}\.(jpg|png|webp)$/;

const PRIVATE_PREFIXES = [
  "/admin",
  "/dashboard",
  "/api",
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
];

export function blankText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

export function cleanSeoImage(value: string | null | undefined): string | null {
  if (value == null || value.trim() === "") return null;
  const raw = value.trim();
  if (raw.length > 500) {
    throw new BadRequestException("SEO image URL is too long");
  }
  if (MEDIA_PATH.test(raw)) return raw;
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("..") && !raw.includes("?") && !raw.includes("#") && !raw.includes("\\")) {
    return raw;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestException("SEO image must be an http(s) URL or a site path");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new BadRequestException("SEO image must use http or https");
  }
  return url.toString();
}

export function canonicalOrigin(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestException("Canonical base URL must start with http:// or https://");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new BadRequestException("Canonical base URL must start with http:// or https://");
  }
  return url.origin;
}

export function robotsPath(line: string): string {
  if (/^(allow|user-agent|sitemap):/i.test(line)) {
    throw new BadRequestException("Extra robots accepts paths only, such as /legacy");
  }
  let path = line.trim();
  if (/^disallow:\s+/i.test(path)) {
    path = path.replace(/^disallow:\s+/i, "").trim();
  } else if (!path.startsWith("/")) {
    throw new BadRequestException("Each robots path must start with /, for example /legacy");
  }
  path = path.split("?")[0]?.split("#")[0] ?? "";
  if (path === "/") {
    throw new BadRequestException("Use the search switch to hide the whole site");
  }
  if (path.includes("..") || !/^\/[A-Za-z0-9._~/-]*$/.test(path)) {
    throw new BadRequestException("That robots path cannot be blocked. Use a public path such as /legacy");
  }
  return path;
}

export function cleanCanonicalPath(value: string | null | undefined): string | null {
  if (value == null || value.trim() === "") return null;
  const path = value.trim().split("?")[0]?.split("#")[0] ?? "";
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("..") || path.includes("\\")) {
    throw new BadRequestException("Canonical path must be a site path starting with /");
  }
  if (PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    throw new BadRequestException("Canonical path cannot target a private route");
  }
  return path;
}
