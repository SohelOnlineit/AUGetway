import type { ReactNode } from "react";
import { DashboardChrome } from "@/components/storefront/DashboardChrome";
import { buildNoIndexMetadata } from "@/lib/catalog/seo";

export const metadata = buildNoIndexMetadata({
  title: "Orders — AuGetway",
  path: "/orders",
});

export default function OrdersLayout({ children }: { children: ReactNode }) {
  return <DashboardChrome>{children}</DashboardChrome>;
}
