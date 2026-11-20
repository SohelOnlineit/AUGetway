/** Public shops that share one database, catalog, stock, orders, and live chat. */
export const STOREFRONTS = {
  amarpin: {
    key: "default",
    siteName: "AuGetway",
    canonicalBaseUrl: "https://pay.uniqbd.com",
    lightLogoPath: "/logo/amarpin-logo-light.png",
    darkLogoPath: "/logo/amarpin-logo-dark.png",
  },
  uniqbd: {
    key: "uniqbd",
    siteName: "UniQbd",
    canonicalBaseUrl: "https://uniqbd.com",
    lightLogoPath: "/logo/uniqbd-logo-light.png",
    darkLogoPath: "/logo/uniqbd-logo-dark.png",
  },
} as const;

export type StorefrontId = keyof typeof STOREFRONTS;

export function resolveStorefrontId(value: string | undefined): StorefrontId {
  const host = hostOf(value);
  if (host === "pay.uniqbd.com" || host === "www.pay.uniqbd.com" || host === "api.pay.uniqbd.com") {
    return "amarpin";
  }
  if (host === "uniqbd" || host === "uniqbd.com" || host === "www.uniqbd.com" || host.endsWith(".uniqbd.com")) {
    return "uniqbd";
  }
  return "amarpin";
}

/** The shop a browser or website request belongs to. An API hostname alone does not decide it. */
export function storefrontFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): StorefrontId {
  const pick = (name: string) => {
    const value = headers[name];
    return (Array.isArray(value) ? value[0] : value)?.trim();
  };
  const explicit = pick("x-storefront");
  if (explicit === "amarpin" || explicit === "uniqbd") return explicit;
  for (const name of ["origin", "referer", "x-forwarded-host", "host"]) {
    const value = pick(name);
    if (value && isShopHost(value)) return resolveStorefrontId(value);
  }
  return explicit ? resolveStorefrontId(explicit) : "amarpin";
}

function hostOf(value: string | undefined) {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return "";
  try {
    if (raw.includes("://")) return new URL(raw).hostname;
  } catch {
    // A bare host is handled below.
  }
  return raw.split(",")[0]?.trim().split("/")[0]?.split(":")[0] ?? "";
}

function isShopHost(value: string) {
  const host = hostOf(value);
  if (host === "api.pay.uniqbd.com") return false;
  return (
    host === "amarpin" ||
    host === "uniqbd" ||
    host === "amarpin.com" ||
    host === "www.amarpin.com" ||
    host.endsWith(".amarpin.com") ||
    host === "pay.uniqbd.com" ||
    host === "www.pay.uniqbd.com" ||
    host === "uniqbd.com" ||
    host === "www.uniqbd.com" ||
    host.endsWith(".uniqbd.com")
  );
}
