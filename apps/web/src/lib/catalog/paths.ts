/** Public product URL is the site root plus the product slug. */
export function productPublicPath(slug: string) {
  const clean = slug.trim().replace(/^\/+|\/+$/g, "");
  return `/${clean}`;
}
