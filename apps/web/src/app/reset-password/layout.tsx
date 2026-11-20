import type { ReactNode } from "react";
import { DashboardChrome } from "@/components/storefront/DashboardChrome";
import { buildNoIndexMetadata } from "@/lib/catalog/seo";

export const metadata = buildNoIndexMetadata({
  title: "Reset password — AuGetway",
  path: "/reset-password",
});

export default function ResetPasswordLayout({ children }: { children: ReactNode }) {
  return <DashboardChrome>{children}</DashboardChrome>;
}
