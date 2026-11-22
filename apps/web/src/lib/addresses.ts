import { useEffect, useState } from "react";

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
      host,
    });
  }, []);
  return addresses;
}
