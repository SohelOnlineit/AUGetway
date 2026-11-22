"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { applySiteChrome, type PublicSite } from "@/lib/site";

/**
 * The name and logo of the address the visitor came in on (pay.uniqbd.com or pay.amarpin.com), shown at the top of the
 * public bill and payment link pages. It also sets the tab title, icon and colour for that address.
 */
export function BrandBar() {
  const [site, setSite] = useState<PublicSite | null>(null);
  useEffect(() => {
    api<PublicSite>("/public/site").then(setSite).catch(() => undefined);
  }, []);
  useEffect(() => {
    applySiteChrome(site, { layout: true });
  }, [site]);
  const brand = !site?.brandName || site.brandName === "UniqBD Pay" ? "AU-Getway" : site.brandName;
  return (
    <header className="top" style={{ marginBottom: 12 }}>
      <span className="brand">
        {site?.brandLogo ? <img className="brand-logo" src={site.brandLogo} alt={brand} /> : <><span className="mark">{brand.slice(0, 1)}</span>{brand}</>}
      </span>
    </header>
  );
}
