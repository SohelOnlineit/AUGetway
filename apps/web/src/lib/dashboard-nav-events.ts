/** Dispatched from SiteHeader when the mobile menu control is used on /admin routes */
export const ADMIN_MOBILE_NAV_TOGGLE_EVENT = "amarpin:admin-mobile-nav-toggle";

/** Dispatched from SiteHeader when the mobile menu control is used on customer account routes */
export const ACCOUNT_MOBILE_NAV_TOGGLE_EVENT = "amarpin:account-mobile-nav-toggle";

const ACCOUNT_PREFIXES = [
  "/dashboard",
  "/orders",
  "/refunds",
  "/wallet",
  "/tickets",
  "/chat",
  "/wishlist",
  "/notifications",
  "/profile",
  "/settings",
];

export function isAccountPanel(pathname: string) {
  return ACCOUNT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
