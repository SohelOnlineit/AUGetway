import type { ReactNode } from "react";
import { DashboardChrome } from "@/components/storefront/DashboardChrome";

export default function NotificationsLayout({ children }: { children: ReactNode }) {
  return <DashboardChrome>{children}</DashboardChrome>;
}
