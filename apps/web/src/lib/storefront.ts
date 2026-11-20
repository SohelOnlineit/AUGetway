/**
 * Shared storefront helpers (client-safe).
 * For request-aware resolution use `@/lib/storefront.server` → `currentStorefront()`.
 */
export type { StorefrontId } from "./storefront.shared";
export { STOREFRONT_LOGOS, resolveStorefrontFromHost } from "./storefront.shared";
