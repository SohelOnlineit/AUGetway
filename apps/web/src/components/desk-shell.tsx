"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { clearToken, readToken, saveToken } from "@/lib/token";
import { ThemeToggle } from "@/components/theme-toggle";
import { applySiteChrome, customBrand, type PublicSite } from "@/lib/site";

const main = [
  ["Dashboard", "/admin", "home"],
  ["Customers", "/admin/customers", "customers"],
  ["Payment Gateways", "/admin/gateways", "card"],
  ["Invoices", "/admin/invoices", "file"],
  ["Payment Links", "/admin/payment-links", "link"],
  ["Transactions", "/admin/transactions", "swap"],
  ["Financial & Transaction Reports", "/admin/reports", "chart"],
  ["Brand & System Settings", "/admin/settings", "sliders"],
] as const;

const smsGateway = [
  ["Android Gateway Nodes", "/admin/sms-gateway", "phone"],
  ["Send SMS", "/admin/sms-gateway/send", "send"],
  ["Sms Logs", "/admin/sms-logs", "chat"],
  ["Security Monitoring", "/admin/security", "shield"],
] as const;

const developers = [
  ["Api Keys", "/admin/api-keys", "key"],
  ["Integrations", "/admin/integrations", "puzzle"],
  ["API References", "/admin/api-references", "code"],
] as const;

function Icon({ name }: { name: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "home") return <svg width="18" height="18" viewBox="0 0 24 24"><path {...common} d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" /></svg>;
  if (name === "customers") return <svg width="18" height="18" viewBox="0 0 24 24"><path {...common} d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8.5 1.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3.5 19c.4-2.4 2.2-4 4.5-4s4.1 1.6 4.5 4M14 15c1.8 0 3.4 1.1 4 3" /></svg>;
  if (name === "card") return <svg width="18" height="18" viewBox="0 0 24 24"><rect {...common} x="3" y="6" width="18" height="12" rx="2" /><path {...common} d="M3 10h18" /></svg>;
  if (name === "file") return <svg width="18" height="18" viewBox="0 0 24 24"><path {...common} d="M7 3.5h7l5 5V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" /><path {...common} d="M14 3.5V9h5" /></svg>;
  if (name === "link") return <svg width="18" height="18" viewBox="0 0 24 24"><path {...common} d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path {...common} d="M14 11a5 5 0 0 0-7.1-.1l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" /></svg>;
  if (name === "chat") return <svg width="18" height="18" viewBox="0 0 24 24"><path {...common} d="M6 17.5 3.5 20V6.5A2 2 0 0 1 5.5 4.5h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2z" /></svg>;
  if (name === "shield") return <svg width="18" height="18" viewBox="0 0 24 24"><path {...common} d="M12 3.5 19 6.2v5.3c0 4.2-2.8 7.2-7 8.9-4.2-1.7-7-4.7-7-8.9V6.2z" /><path {...common} d="m9 12 2 2 4-4.2" /></svg>;
  if (name === "phone") return <svg width="18" height="18" viewBox="0 0 24 24"><rect {...common} x="7" y="3" width="10" height="18" rx="2" /><path {...common} d="M11 18h2" /></svg>;
  if (name === "send") return <svg width="18" height="18" viewBox="0 0 24 24"><path {...common} d="m4 12 16-7-6 16-2.2-6.2L4 12z" /></svg>;
  if (name === "swap") return <svg width="18" height="18" viewBox="0 0 24 24"><path {...common} d="M7 7h11l-3-3M17 17H6l3 3" /></svg>;
  if (name === "chart") return <svg width="18" height="18" viewBox="0 0 24 24"><path {...common} d="M5 19V10M12 19V5M19 19v-7" /></svg>;
  if (name === "sliders") return <svg width="18" height="18" viewBox="0 0 24 24"><path {...common} d="M4 8h16M4 16h16M8 8v4M16 12v4" /></svg>;
  if (name === "admins") return <svg width="18" height="18" viewBox="0 0 24 24"><path {...common} d="M12 12a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM5.5 19.2c.5-2.6 2.8-4.2 6.5-4.2s6 1.6 6.5 4.2" /><path {...common} d="M18 8v4M16 10h4" /></svg>;
  if (name === "key") return <svg width="18" height="18" viewBox="0 0 24 24"><circle {...common} cx="8" cy="14" r="3.2" /><path {...common} d="M11 14h9l-2 2M17 14l2-2" /></svg>;
  if (name === "puzzle") return <svg width="18" height="18" viewBox="0 0 24 24"><path {...common} d="M8 4h3a2 2 0 1 1 0 4h1v2h2a2 2 0 1 1 4 0v2h-2v3a2 2 0 1 1-4 0v-1H9v2H7a2 2 0 0 1-2-2V9h2a2 2 0 1 0 0-4H8z" /></svg>;
  return <svg width="18" height="18" viewBox="0 0 24 24"><path {...common} d="m8 8-4 4 4 4M16 8l4 4-4 4M13 6l-2 12" /></svg>;
}

const pages = [...main, ...smsGateway, ...developers, ["Account", "/admin/account", "admins"] as const];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  if (href === "/admin/customers") return pathname === "/admin/customers" || pathname === "/admin/admins";
  if (href === "/admin/gateways") return pathname.startsWith("/admin/gateways") || pathname.startsWith("/admin/official-gateways");
  if (href === "/admin/invoices") return pathname.startsWith("/admin/invoices");
  if (href === "/admin/payment-links") return pathname.startsWith("/admin/payment-links");
  if (href === "/admin/api-keys") return pathname.startsWith("/admin/api-keys");
  if (href === "/admin/sms-gateway") return pathname === "/admin/sms-gateway";
  return pathname === href;
}

function initials(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

export function DeskShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [openDev, setOpenDev] = useState(true);
  const [openSms, setOpenSms] = useState(true);
  const [query, setQuery] = useState("");
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [cacheNote, setCacheNote] = useState(false);
  const [site, setSite] = useState<PublicSite | null>(null);
  const [adminMode, setAdminMode] = useState("");

  useEffect(() => {
    if (!readToken()) {
      router.replace("/au");
      return;
    }
    const fresh = new URL(window.location.href);
    if (fresh.searchParams.has("fresh")) {
      fresh.searchParams.delete("fresh");
      window.history.replaceState(null, "", `${fresh.pathname}${fresh.search}${fresh.hash}`);
    }
    if (sessionStorage.getItem("uniqpay_cache_note") === "1") setCacheNote(true);
    api<{ name: string; email: string }>("/auth/me")
      .then((row) => {
        setUser(row);
        setReady(true);
      })
      .catch(() => {
        clearToken();
        router.replace("/au");
      });
    function onAccount(event: Event) {
      const detail = (event as CustomEvent<{ name?: string; email?: string }>).detail;
      if (!detail?.name || !detail.email) return;
      setUser({ name: detail.name, email: detail.email });
    }
    window.addEventListener("uniqpay-account", onAccount);
    api<{ brandName: string; prefs: Record<string, string> }>("/desk/settings")
      .then((row) => {
        setAdminMode(row.prefs.themeMode ?? "");
        setSite({
          brandName: row.brandName,
          supportEmail: "",
          supportPhone: row.prefs.supportPhone ?? "",
          currency: "",
          currencySymbol: row.prefs.currencySymbol ?? "",
          checkoutNote: "",
          brandLogo: row.prefs.brandLogo ?? "",
          brandFavicon: row.prefs.brandFavicon ?? "",
          themeAccent: row.prefs.themeAccent ?? "",
          checkoutTheme: "",
          methodTabs: "",
          checkoutLang: "",
          faqTitle: "",
          faqContent: "",
          metaTitle: row.prefs.metaTitle ?? "",
          metaDescription: row.prefs.metaDescription ?? "",
        });
      })
      .catch(() => undefined);
    return () => window.removeEventListener("uniqpay-account", onAccount);
  }, [router]);

  useEffect(() => {
    applySiteChrome(site, { adminMode });
  }, [site, adminMode]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!cacheNote) return;
    const timer = setTimeout(() => {
      sessionStorage.removeItem("uniqpay_cache_note");
      setCacheNote(false);
    }, 4000);
    return () => clearTimeout(timer);
  }, [cacheNote]);

  if (!ready) return null;

  const matches = query.trim()
    ? pages.filter(([label]) => label.toLowerCase().includes(query.trim().toLowerCase()))
    : [];

  function signOut() {
    clearToken();
    router.replace("/au");
  }

  function clearCache() {
    if (clearing) return;
    setClearing(true);
    const token = readToken();
    if ("caches" in window) {
      void caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))).catch(() => undefined);
    }
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => undefined);
    }
    if (token) saveToken(token);
    sessionStorage.setItem("uniqpay_cache_note", "1");
    const next = new URL(window.location.href);
    next.searchParams.set("fresh", String(Date.now()));
    window.location.assign(next.toString());
  }

  return (
    <div className={navOpen ? "desk nav-open" : "desk"}>
      <header className="topbar">
        <div className="topbar-inner">
        <button className="menu-toggle" type="button" aria-label={navOpen ? "Close menu" : "Open menu"} aria-expanded={navOpen} onClick={() => setNavOpen((open) => !open)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            {navOpen ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        <Link href="/admin" className="wordmark" aria-label={site?.brandName || "AU-Getway"}>
          {site?.brandLogo ? <img className="brand-logo" src={site.brandLogo} alt="" /> : null}
          <span>{customBrand(site) ? site?.brandName : "AU-Getway"}</span>
        </Link>
        <div className="top-tools">
          <div className="top-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={query}
              placeholder="Search"
              aria-label="Search"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && matches[0]) {
                  router.push(matches[0][1]);
                  setQuery("");
                }
              }}
            />
            {matches.length > 0 ? (
              <div className="search-list">
                {matches.map(([label, href]) => (
                  <Link key={href} href={href} onClick={() => setQuery("")}>
                    {label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          <ThemeToggle />
          <button className={`cache-clear${clearing ? " busy" : ""}`} type="button" aria-label="Clear website cache" title="Clear website cache" disabled={clearing} onClick={() => void clearCache()}>
            <svg className="cache-server" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3.5" y="3" width="17" height="6.2" rx="1.6" />
              <rect x="3.5" y="14.8" width="17" height="6.2" rx="1.6" />
              <path className="cache-link" d="M8 9.2v5.6" />
              <path className="cache-link" d="M12 9.2v5.6" />
              <path className="cache-link" d="M16 9.2v5.6" />
              <path d="M10.5 6.1h6" />
              <path d="M10.5 17.9h6" />
              <circle className="cache-led" cx="7.2" cy="6.1" r="0.95" fill="currentColor" stroke="none" />
              <circle className="cache-led cache-led-b" cx="7.2" cy="17.9" r="0.95" fill="currentColor" stroke="none" />
            </svg>
          </button>
          {cacheNote ? <p className="cache-note">Cache cleared</p> : null}
          <button className={menuOpen ? "avatar on" : "avatar"} type="button" onClick={() => setMenuOpen((open) => !open)} aria-label="Account" aria-expanded={menuOpen}>
            {user ? initials(user.name, user.email) : "·"}
          </button>
          {menuOpen ? (
            <div className="avatar-menu">
              <div className="avatar-who">
                <span className="avatar mini" aria-hidden="true">{user ? initials(user.name, user.email) : "·"}</span>
                <div>
                  <strong>{user?.name || "Desk"}</strong>
                  <p>{user?.email}</p>
                </div>
              </div>
              <Link className="menu-row" href="/admin/account" onClick={() => setMenuOpen(false)}>
                <span className="menu-ico user" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="8" r="3" /><path d="M6 19c.6-2.4 2.6-4 6-4s5.4 1.6 6 4" /></svg>
                </span>
                Email and password
              </Link>
              <button className="menu-row out" type="button" onClick={signOut}>
                <span className="menu-ico out" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M10 7V5a1 1 0 0 1 1-1h8v16h-8a1 1 0 0 1-1-1v-2" /><path d="M4 12h11M12 8l4 4-4 4" /></svg>
                </span>
                Sign out
              </button>
            </div>
          ) : null}
        </div>
        </div>
      </header>
      <div className="desk-frame">
      <button className="nav-shade" type="button" aria-label="Close menu" onClick={() => setNavOpen(false)} />
      <aside className="rail">
        <nav className="rail-box">
        {main.map(([label, href, icon]) => (
          <Link key={href} href={href} onClick={() => setNavOpen(false)} className={isActive(pathname, href) ? `nav-tone nav-tone--${icon} active` : `nav-tone nav-tone--${icon}`}>
            <span className="nav-icon"><Icon name={icon} /></span>
            <span className="nav-label">{label}</span>
          </Link>
        ))}
        <button className="group" type="button" aria-expanded={openSms} onClick={() => setOpenSms((open) => !open)}>
          <span>SMS Gateway</span>
          <span className={openSms ? "chev open" : "chev"} aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
          </span>
        </button>
        {openSms
          ? smsGateway.map(([label, href, icon]) => (
              <Link key={href} href={href} onClick={() => setNavOpen(false)} className={isActive(pathname, href) ? `nav-sub nav-tone nav-tone--${icon} active` : `nav-sub nav-tone nav-tone--${icon}`}>
                <span className="nav-icon"><Icon name={icon} /></span>
                <span className="nav-label">{label}</span>
              </Link>
            ))
          : null}
        <button className="group" type="button" aria-expanded={openDev} onClick={() => setOpenDev((open) => !open)}>
          <span>Developers</span>
          <span className={openDev ? "chev open" : "chev"} aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
          </span>
        </button>
        {openDev
          ? developers.map(([label, href, icon]) => (
              <Link key={href} href={href} onClick={() => setNavOpen(false)} className={isActive(pathname, href) ? `nav-sub nav-tone nav-tone--${icon} active` : `nav-sub nav-tone nav-tone--${icon}`}>
                <span className="nav-icon"><Icon name={icon} /></span>
                <span className="nav-label">{label}</span>
              </Link>
            ))
          : null}
        </nav>
      </aside>
      <section className="stage">{children}</section>
      </div>
    </div>
  );
}
