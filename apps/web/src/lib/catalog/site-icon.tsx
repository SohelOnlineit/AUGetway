import { ImageResponse } from "next/og";
import { getApiBaseUrl } from "@/lib/auth/api-base";
import { fetchSiteContent } from "@/lib/catalog/api";
import { currentStorefront } from "@/lib/storefront.server";

/** PNG tab icon. Google and browsers ask for /favicon.ico, which used to return HTML. */
export async function renderSiteIcon(px: number) {
  const png = await fetchFaviconPng(px === 180 ? 180 : 48);
  if (png) {
    return new Response(png, {
      headers: {
        "content-type": "image/png",
        "cache-control": "private, no-store",
        vary: "Host, X-Forwarded-Host",
        "x-content-type-options": "nosniff",
      },
    });
  }
  const site = await fetchSiteContent();
  const letter = (site.siteName || "A").trim().slice(0, 1).toUpperCase() || "A";
  const size = px === 180 ? 180 : 48;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#03141c",
          color: "#26bfb0",
          fontSize: Math.round(size * 0.55),
          fontWeight: 700,
        }}
      >
        {letter}
      </div>
    ),
    { width: size, height: size },
  );
}

async function fetchFaviconPng(px: number) {
  try {
    const storefront = await currentStorefront();
    const response = await fetch(`${getApiBaseUrl()}/content/favicon/${storefront}?size=${px}`, {
      headers: { "x-storefront": storefront },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("image/png")) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
    return bytes;
  } catch {
    return null;
  }
}
