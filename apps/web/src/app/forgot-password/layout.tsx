import type { ReactNode } from "react";
import { DashboardChrome } from "@/components/storefront/DashboardChrome";
import { buildNoIndexMetadata } from "@/lib/catalog/seo";

export const metadata = buildNoIndexMetadata({
  title: "Forgot password — AuGetway",
  path: "/forgot-password",
});

export default function ForgotPasswordLayout({ children }: { children: ReactNode }) {
  return <DashboardChrome>{children}</DashboardChrome>;
}
