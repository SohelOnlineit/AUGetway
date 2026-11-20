import { headers } from "next/headers";
import type { StorefrontId } from "@/lib/storefront.shared";
import { resolveStorefrontFromHost, storefrontFromHeader } from "@/lib/storefront.shared";

/** Request Host / x-forwarded-host — use only from Server Components and Route Handlers. */
export async function currentStorefront(): Promise<StorefrontId> {
  try {
    const headerList = await headers();
    const host =
      headerList.get("x-forwarded-host") ?? headerList.get("host") ?? undefined;
    return resolveStorefrontFromHost(host);
  } catch {
    // Static generation has no request headers.
  }
  return "amarpin";
}

/** Explicit `x-storefront` wins. Otherwise the request host decides. */
export async function requestedStorefront(headerValue?: string | null): Promise<StorefrontId> {
  const explicit = storefrontFromHeader(headerValue);
  if (explicit) return explicit;
  try {
    const incoming = storefrontFromHeader((await headers()).get("x-storefront"));
    if (incoming) return incoming;
  } catch {
    // Static generation has no request headers.
  }
  return currentStorefront();
}
