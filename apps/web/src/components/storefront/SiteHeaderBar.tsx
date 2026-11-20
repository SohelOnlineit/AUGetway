import { cookies } from "next/headers";
import { fetchSiteContent } from "@/lib/catalog/api";
import { ACCESS_COOKIE } from "@/lib/auth/constants";
import { SiteHeader } from "./SiteHeader";

/** Header shell renders with the page. Account details load in the browser. */
export async function SiteHeaderBar() {
  const site = await fetchSiteContent();
  const loggedIn = Boolean((await cookies()).get(ACCESS_COOKIE)?.value);
  return (
    <SiteHeader
      site={site}
      cartCount={0}
      accountName={site.siteName}
      accountId=""
      loggedIn={loggedIn}
      isStaff={false}
      roleLabel="CUSTOMER"
    />
  );
}
