/** Host-derived storefront — safe to import from client or server (no next/headers). */
export type StorefrontId = "amarpin" | "uniqbd";

export const STOREFRONT_LOGOS: Record<StorefrontId, { light: string; dark: string }> = {
  amarpin: {
    light: "/logo/amarpin-logo-light.png",
    dark: "/logo/amarpin-logo-dark.png",
  },
  uniqbd: {
    light: "/logo/uniqbd-logo-light.png",
    dark: "/logo/uniqbd-logo-dark.png",
  },
};

export function storefrontFromHeader(value: string | null | undefined): StorefrontId | null {
  if (value === "amarpin" || value === "uniqbd") return value;
  return null;
}

export function resolveStorefrontFromHost(hostRaw: string | null | undefined): StorefrontId {
  const host = (hostRaw ?? "")
    .split(",")[0]
    ?.trim()
    .split(":")[0]
    ?.toLowerCase();
  if (host === "pay.uniqbd.com" || host === "www.pay.uniqbd.com") return "amarpin";
  if (host === "uniqbd.com" || host === "www.uniqbd.com") return "uniqbd";
  return "amarpin";
}
