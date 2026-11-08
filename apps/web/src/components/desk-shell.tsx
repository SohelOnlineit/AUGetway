"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const main = [
  ["Dashboard", "/admin", "home"],
  ["Customers", "/admin/customers", "customers"],
  ["Gateways", "/admin/gateways", "card"],
  ["Invoices", "/admin/invoices", "file"],
  ["Payment Links", "/admin/payment-links", "link"],
  ["Transactions", "/admin/transactions", "swap"],
  ["Financial & Transaction Reports", "/admin/reports", "chart"],
  ["Brand & System Settings", "/admin/settings", "sliders"],
] as const;

const smsGateway = [
  ["Android Gateway Nodes", "/admin/sms-gateway", "phone"],
  ["Sms Logs", "/admin/sms-logs", "chat"],
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
  if (name === "phone") return <svg width="18" height="18" viewBox="0 0 24 24"><rect {...common} x="7" y="3" width="10" height="18" rx="2" /><path {...common} d="M11 18h2" /></svg>;
  if (name === "swap") return <svg width="18" height="18" viewBox="0 0 24 24"><path {...common} d="M7 7h11l-3-3M17 17H6l3 3" /></svg>;
  if (name === "chart") return <svg width="18" height="18" viewBox="0 0 24 24"><path {...common} d="M5 19V10M12 19V5M19 19v-7" /></svg>;
  if (name === "sliders") return <svg width="18" height="18" viewBox="0 0 24 24"><path {...common} d="M4 8h16M4 16h16M8 8v4M16 12v4" /></svg>;
  if (name === "key") return <svg width="18" height="18" viewBox="0 0 24 24"><circle {...common} cx="8" cy="14" r="3.2" /><path {...common} d="M11 14h9l-2 2M17 14l2-2" /></svg>;
  if (name === "puzzle") return <svg width="18" height="18" viewBox="0 0 24 24"><path {...common} d="M8 4h3a2 2 0 1 1 0 4h1v2h2a2 2 0 1 1 4 0v2h-2v3a2 2 0 1 1-4 0v-1H9v2H7a2 2 0 0 1-2-2V9h2a2 2 0 1 0 0-4H8z" /></svg>;
  return <svg width="18" height="18" viewBox="0 0 24 24"><path {...common} d="m8 8-4 4 4 4M16 8l4 4-4 4M13 6l-2 12" /></svg>;
}

const pages = [...main, ...smsGateway, ...developers];

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

  useEffect(() => {
    if (!sessionStorage.getItem("uniqpay_token")) {
      router.replace("/login");
      return;
    }
    setReady(true);
    api<{ name: string; email: string }>("/auth/me")
      .then(setUser)
      .catch(() => setUser(null));
  }, [router]);

  if (!ready) return null;

  const matches = query.trim()
    ? pages.filter(([label]) => label.toLowerCase().includes(query.trim().toLowerCase()))
    : [];

  function signOut() {
    sessionStorage.removeItem("uniqpay_token");
    router.replace("/login");
  }

  return (
    <div className="desk">
      <header className="topbar">
        <Link href="/admin" className="wordmark" aria-label="UniQbd">
          <span className="wordmark-uni">Uni</span>
          <span className="wordmark-q">Q</span>
          <span className="wordmark-bd">bd</span>
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
          <button className="avatar" type="button" onClick={() => setMenuOpen((open) => !open)} aria-label="Account">
            {user ? initials(user.name, user.email) : "·"}
          </button>
          {menuOpen ? (
            <div className="avatar-menu">
              <p>{user?.name || "Desk"}</p>
              <p className="tiny">{user?.email}</p>
              <button className="btn-line" type="button" onClick={signOut}>Sign out</button>
            </div>
          ) : null}
        </div>
      </header>
      <aside className="rail">
        <nav className="rail-box">
        {main.map(([label, href, icon]) => (
          <Link key={href} href={href} className={pathname === href ? "active" : ""}>
            <span className="nav-icon"><Icon name={icon} /></span>
            <span className="nav-label">{label}</span>
          </Link>
        ))}
        <button className="group" type="button" onClick={() => setOpenSms((open) => !open)}>
          <span>SMS Gateway</span>
          <span className="chev">{openSms ? "⌃" : "⌄"}</span>
        </button>
        {openSms
          ? smsGateway.map(([label, href, icon]) => (
              <Link key={href} href={href} className={pathname === href ? "active" : ""}>
                <span className="nav-icon"><Icon name={icon} /></span>
                <span className="nav-label">{label}</span>
              </Link>
            ))
          : null}
        <button className="group" type="button" onClick={() => setOpenDev((open) => !open)}>
          <span>Developers</span>
          <span className="chev">{openDev ? "⌃" : "⌄"}</span>
        </button>
        {openDev
          ? developers.map(([label, href, icon]) => (
              <Link key={href} href={href} className={pathname === href ? "active" : ""}>
                <span className="nav-icon"><Icon name={icon} /></span>
                <span className="nav-label">{label}</span>
              </Link>
            ))
          : null}
        </nav>
      </aside>
      <section className="stage">{children}</section>
    </div>
  );
}
