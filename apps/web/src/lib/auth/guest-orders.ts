import { getApiBaseUrl } from "./api-base";

/** True only when the storefront API explicitly allows guest orders. */
export async function guestOrdersEnabled(): Promise<boolean> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/storefront/guest-orders`, {
      cache: "no-store",
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as { enabled?: unknown };
    return payload.enabled === true;
  } catch {
    return false;
  }
}
