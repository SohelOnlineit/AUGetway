import { renderSiteIcon } from "@/lib/catalog/site-icon";

export const dynamic = "force-dynamic";

export function GET() {
  return renderSiteIcon(180);
}
