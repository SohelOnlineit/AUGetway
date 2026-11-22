import type { PublicSite } from "@uniqpay/types";

export type { PublicSite };

export function applySiteChrome(site: PublicSite | null | undefined, options?: { layout?: boolean; adminMode?: string }) {
  if (!site || typeof document === "undefined") return;
  if (site.themeAccent) document.documentElement.style.setProperty("--brand", site.themeAccent);
  if (site.brandFavicon) {
    document.querySelectorAll<HTMLLinkElement>("link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']").forEach((node) => {
      if (node.getAttribute("data-site-icon") !== "1") node.remove();
    });
    let link = document.querySelector<HTMLLinkElement>("link[data-site-icon]");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      link.setAttribute("data-site-icon", "1");
      document.head.appendChild(link);
    }
    const mime = /^data:(image\/[a-z0-9.+-]+);/i.exec(site.brandFavicon)?.[1];
    if (mime) link.type = mime;
    link.href = site.brandFavicon;
  }
  // The tab title is the page's own title: the SEO title if one is set, otherwise the name of the address.
  if (site.metaTitle) document.title = site.metaTitle;
  else if (site.brandName) document.title = site.brandName;
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
