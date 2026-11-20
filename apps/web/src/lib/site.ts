import type { PublicSite } from "@uniqpay/types";

export type { PublicSite };

export function applySiteChrome(site: PublicSite | null | undefined, options?: { layout?: boolean; adminMode?: string }) {
  if (!site || typeof document === "undefined") return;
  if (site.themeAccent) document.documentElement.style.setProperty("--brand", site.themeAccent);
  if (site.brandFavicon) {
    let link = document.querySelector<HTMLLinkElement>("link[data-site-icon]");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      link.setAttribute("data-site-icon", "1");
      document.head.appendChild(link);
    }
    link.href = site.brandFavicon;
  }
  if (site.metaTitle) document.title = site.metaTitle;
  const description = document.querySelector<HTMLMetaElement>("meta[name='description']");
  if (description && site.metaDescription) description.content = site.metaDescription;
  if (options?.layout && (site.checkoutTheme === "clean_light" || site.checkoutTheme === "modern_dark")) {
    paintTheme(site.checkoutTheme === "clean_light");
  }
  const mode = options?.adminMode;
  if (mode === "light" || mode === "dark") paintTheme(mode === "light");
  if (mode === "system") paintTheme(window.matchMedia("(prefers-color-scheme: light)").matches);
}

function paintTheme(light: boolean) {
  document.documentElement.setAttribute("data-theme", light ? "light" : "dark");
  document.documentElement.style.colorScheme = light ? "light" : "dark";
  localStorage.setItem("uniqpay_theme", light ? "LIGHT" : "DARK");
}

export function customBrand(site: { brandName?: string; brandLogo?: string } | null | undefined) {
  if (!site) return false;
  return Boolean(site.brandLogo || (site.brandName && site.brandName !== "AU-Getway" && site.brandName !== "UniqBD Pay"));
}
