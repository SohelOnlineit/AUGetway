import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/auth/api-base";
import { requestedStorefront } from "@/lib/storefront.server";

/** Public shop JSON for the phone app. Nest stays on localhost; Next publishes these GETs. */
export async function proxyCatalogGet(request: Request, path: string) {
  const incoming = new URL(request.url);
  const storefront = await requestedStorefront(request.headers.get("x-storefront"));
  const upstream = await fetch(`${getApiBaseUrl()}${path}${incoming.search}`, {
    headers: { accept: "application/json", "x-storefront": storefront },
    cache: "no-store",
  });
  return new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}
