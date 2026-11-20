import { renderSiteIcon } from "@/lib/catalog/site-icon";

export const dynamic = "force-dynamic";

export async function GET() {
  const response = await renderSiteIcon(48);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("vary", "Host, X-Forwarded-Host");
  response.headers.set("content-type", "image/png");
  return response;
}
