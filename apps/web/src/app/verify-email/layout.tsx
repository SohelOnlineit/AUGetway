import type { ReactNode } from "react";
import { DashboardChrome } from "@/components/storefront/DashboardChrome";
import { buildNoIndexMetadata } from "@/lib/catalog/seo";

export const metadata = buildNoIndexMetadata({
  title: "Verify email — AuGetway",
  path: "/verify-email",
});

export default function VerifyEmailLayout({ children }: { children: ReactNode }) {
  return <DashboardChrome>{children}</DashboardChrome>;
}
