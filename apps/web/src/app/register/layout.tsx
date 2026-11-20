import type { ReactNode } from "react";
import { DashboardChrome } from "@/components/storefront/DashboardChrome";
import { buildNoIndexMetadata } from "@/lib/catalog/seo";

export const metadata = buildNoIndexMetadata({
  title: "Create account — AuGetway",
  path: "/register",
});

export default function RegisterLayout({ children }: { children: ReactNode }) {
  return <DashboardChrome>{children}</DashboardChrome>;
}
