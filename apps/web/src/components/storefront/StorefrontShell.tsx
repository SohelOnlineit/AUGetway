import type { ReactNode } from "react";
import type { PublicSiteContent } from "@amarpin/types";
import { StorefrontAnalytics } from "@/components/analytics/StorefrontAnalytics";
import { SiteFooter } from "./SiteFooter";

export function StorefrontShell({
  site,
  children,
}: {
  site: PublicSiteContent;
  children: ReactNode;
}) {
  return (
    <div className="storefront">
      <StorefrontAnalytics />
      <div className="storefront-main">{children}</div>
      <SiteFooter site={site} />
    </div>
  );
}
