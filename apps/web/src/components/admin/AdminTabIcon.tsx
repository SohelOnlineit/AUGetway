"use client";

import { useEffect } from "react";
import type { AdminAppearance } from "@amarpin/types";
import { adminFetch } from "@/lib/admin/api";
import { resolveStorefrontFromHost } from "@/lib/storefront";

export function applyAdminFavicon(path: string | null) {
  const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')];
  if (!path) return;
  const link = links[0] ?? document.createElement("link");
  link.rel = "icon";
  link.type = "image/png";
  link.href = `/favicon.ico?v=${Date.now()}`;
  if (!link.isConnected) document.head.appendChild(link);
  for (const other of links) {
    if (other !== link) other.remove();
  }
}

/** Tab icon for the shop whose host this admin page was opened on. */
export function AdminTabIcon() {
  useEffect(() => {
    let cancelled = false;
    void adminFetch<AdminAppearance>("/appearance").then((result) => {
      if (cancelled || !result.ok) return;
      const id = resolveStorefrontFromHost(window.location.host);
      const brand = result.data.brands.find((item) => item.id === id);
      applyAdminFavicon(brand?.faviconPath ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
