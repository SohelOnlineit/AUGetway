import { requestedStorefront } from "@/lib/storefront.server";
import { getApiBaseUrl } from "./api-base";

/** Server-side BFF helper: forward access token to Nest API. */
export async function apiFetchWithAccessToken(
  path: string,
  accessToken: string | undefined,
  init: RequestInit = {},
) {
  if (!accessToken) {
    return new Response(JSON.stringify({ message: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${accessToken}`);
  if (!headers.has("x-storefront")) {
    headers.set("x-storefront", await requestedStorefront());
  }
  if (!headers.has("content-type") && init.body) {
    headers.set("content-type", "application/json");
  }

  return fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}
