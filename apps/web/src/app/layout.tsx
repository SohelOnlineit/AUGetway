import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import Script from "next/script";
import { APP_NAME, SEO_VERIFIERS, type PublicSiteContent } from "@amarpin/types";
import { LiveChatLauncher } from "@/components/chat/LiveChatLauncher";
import { SiteHeaderBar } from "@/components/storefront/SiteHeaderBar";
import { ThemeSync } from "@/components/theme/ThemeSync";
import { TrafficOrigin } from "@/components/storefront/TrafficOrigin";
import { ScreenNotice } from "@/components/ui/ScreenNotice";
import { fetchSiteContent } from "@/lib/catalog/api";
import { resolveSiteOrigin } from "@/lib/catalog/seo";
import { ACCESS_COOKIE } from "@/lib/auth/constants";
import { THEME_BOOT_SCRIPT } from "@/lib/theme/theme";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

function verificationMeta(site: PublicSiteContent): Metadata["verification"] {
  const links = site.verifications ?? [];
  const google = links.find((item) => item.provider === "google")?.code || site.googleSiteVerification || undefined;
  const yandex = links.find((item) => item.provider === "yandex")?.code;
  const other: Record<string, string> = {};
  for (const link of links) {
    if (link.provider === "google" || link.provider === "yandex") continue;
    const known = SEO_VERIFIERS.find((item) => item.id === link.provider);
    const meta = link.provider === "other" ? link.name : known?.meta;
    if (meta && link.code) other[meta] = link.code;
  }
  if (!links.length && site.bingSiteVerification) other["msvalidate.01"] = site.bingSiteVerification;
  return {
    ...(google ? { google } : {}),
    ...(yandex ? { yandex } : {}),
    ...(Object.keys(other).length ? { other } : {}),
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const site = await fetchSiteContent();
  return {
    metadataBase: new URL(resolveSiteOrigin(site)),
    description: site.defaultSeoDescription || site.tagline || undefined,
    icons: {
      icon: [{ url: "/favicon.ico", type: "image/png", sizes: "48x48" }],
      apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
    },
    title: {
      default: site.defaultSeoTitle || site.siteName || APP_NAME,
      template: site.titleSuffix ? `%s | ${site.titleSuffix}` : "%s",
    },
    robots: site.indexing === false ? { index: false, follow: false } : undefined,
    verification: verificationMeta(site),
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const signedIn = Boolean((await cookies()).get(ACCESS_COOKIE)?.value);
  const userAgent = (await headers()).get("user-agent") ?? "";
  const nativeApp = /(?:AuGetway|UniQbd)App\//.test(userAgent);
  return (
    <html lang="en" className={nativeApp ? "native-app" : undefined} suppressHydrationWarning>
      <body>
        <Script id="theme-boot" strategy="beforeInteractive">
          {THEME_BOOT_SCRIPT}
        </Script>
        <ThemeSync signedIn={signedIn} />
        <TrafficOrigin />
        <SiteHeaderBar />
        <div className="fixed-header-page">{children}</div>
        <LiveChatLauncher />
        <ScreenNotice />
      </body>
    </html>
  );
}
