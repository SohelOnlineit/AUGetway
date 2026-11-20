import { cookies } from "next/headers";
import type { AccountOverview } from "@amarpin/types";
import { AccountShell } from "@/components/account/AccountShell";
import { DashboardScreen } from "@/components/account/DashboardScreen";
import { apiFetchWithAccessToken } from "@/lib/auth/api-client";
import { ACCESS_COOKIE } from "@/lib/auth/constants";

export default async function DashboardPage() {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  const response = await apiFetchWithAccessToken("/account/overview", token);
  if (!response.ok) {
    return (
      <AccountShell title="My Dashboard" bare>
        <p className="form-error">Unable to load dashboard</p>
      </AccountShell>
    );
  }
  const overview = (await response.json()) as AccountOverview;
  return <DashboardScreen initial={overview} />;
}
