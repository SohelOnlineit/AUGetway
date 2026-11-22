import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * The address this page was opened on, and the matching api. address programs use
 * (pay.amarpin.com and api.pay.amarpin.com). Empty until the page is in the browser.
 */
export function useSiteAddresses() {
  const [addresses, setAddresses] = useState({ site: "", api: "", host: "" });
  useEffect(() => {
    const { protocol, host, hostname } = window.location;
    const local = hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
    setAddresses({
      site: `${protocol}//${host}`,
      api: local || hostname.startsWith("api.") ? `${protocol}//${host}` : `${protocol}//api.${host}`,
      host: hostname.replace(/^api\./i, ""),
    });
  }, []);
  return addresses;
}

/** Absolute origin for a registered website address (pay.amarpin.com → https://pay.amarpin.com). */
export function publicOriginForHost(host: string) {
  const clean = host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (!clean) return "";
  if (typeof window === "undefined") return `https://${clean}`;
  const local = clean === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(clean);
  const port = local && window.location.port ? `:${window.location.port}` : "";
  return `${window.location.protocol}//${clean}${port}`;
}

/** Full customer URL on a chosen domain, e.g. https://pay.amarpin.com/l/order-1 */
export function publicPathUrl(path: string, host?: string) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (host) {
    const origin = publicOriginForHost(host);
    return origin ? `${origin}${clean}` : clean;
  }
  if (typeof window === "undefined") return clean;
  return `${window.location.origin}${clean}`;
}

type ShareHost = { host: string; brandName: string };

/**
 * Website addresses this desk answers on. Desk users pick one when copying a customer link so
 * AmarPin customers get pay.amarpin.com and UniqBD customers get pay.uniqbd.com.
 */
export function useShareHosts() {
  const [hosts, setHosts] = useState<ShareHost[]>([]);
  const [shareHost, setShareHost] = useState("");

  useEffect(() => {
    const current = window.location.hostname.replace(/^api\./i, "");
    api<ShareHost[]>("/desk/domains/hosts")
      .then((rows) => {
        const list = rows.length ? rows : [{ host: current, brandName: current }];
        setHosts(list);
        setShareHost(list.some((row) => row.host === current) ? current : list[0].host);
      })
      .catch(() => {
        setHosts([{ host: current, brandName: current }]);
        setShareHost(current);
      });
  }, []);

  return { hosts, shareHost, setShareHost };
}
