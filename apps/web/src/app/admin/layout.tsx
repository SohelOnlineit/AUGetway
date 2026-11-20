import type { ReactNode } from "react";
import { cookies } from "next/headers";
import type { Permission } from "@amarpin/types";
import { AdminFrame } from "@/components/admin/AdminShell";
import { AdminTabIcon } from "@/components/admin/AdminTabIcon";
import { DashboardChrome } from "@/components/storefront/DashboardChrome";
import { apiFetchWithAccessToken } from "@/lib/auth/api-client";
import { ACCESS_COOKIE } from "@/lib/auth/constants";
import { buildNoIndexMetadata } from "@/lib/catalog/seo";

export const metadata = buildNoIndexMetadata({
  title: "Admin — AuGetway",
  path: "/admin",
});

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  const me = await apiFetchWithAccessToken("/admin/me", token);
  const permissions = me.ok
    ? ((await me.json()) as { permissions?: Permission[] }).permissions
    : undefined;

  return (
    <DashboardChrome>
      <AdminTabIcon />
      <AdminFrame permissions={permissions}>{children}</AdminFrame>
    </DashboardChrome>
  );
}
