"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { DashboardNavMenuButton } from "@/components/dashboard/DashboardNavMenuButton";
import { ACCOUNT_MOBILE_NAV_TOGGLE_EVENT } from "@/lib/dashboard-nav-events";
import { SideMenu, type SideMenuSection } from "@/components/dashboard/SideMenu";

const SECTIONS: SideMenuSection[] = [
  {
    id: "overview",
    title: "My account",
    marked: true,
    items: [{ href: "/dashboard", label: "My Dashboard", icon: "grid", exact: true }],
  },
  {
    id: "orders",
    title: "Orders",
    items: [
      {
        href: "/orders",
        label: "Orders",
        icon: "cart",
        children: [
          { href: "/orders", label: "My orders", icon: "receipt" },
          { href: "/refunds", label: "Refunds", icon: "card" },
          { href: "/wallet", label: "Wallet", icon: "wallet" },
        ],
      },
    ],
  },
  {
    id: "support",
    title: "Support",
    items: [
      {
        href: "/tickets",
        label: "Support",
        icon: "headset",
        children: [
          { href: "/tickets", label: "Tickets", icon: "receipt" },
          { href: "/chat", label: "Live chat", icon: "chat" },
        ],
      },
    ],
  },
  {
    id: "profile",
    title: "Profile",
    items: [
      {
        href: "/profile",
        label: "Profile",
        icon: "user",
        children: [
          { href: "/wishlist", label: "Wishlist", icon: "heart" },
          { href: "/notifications", label: "Notifications", icon: "bell" },
          { href: "/profile", label: "Profile", icon: "user" },
          { href: "/settings", label: "Settings", icon: "gear" },
        ],
      },
    ],
  },
];

export function AccountShell({
  title,
  lead,
  bare = false,
  children,
}: {
  title: string;
  lead?: string;
  /** Skip the default title card so a custom page layout can fill the panel. */
  bare?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onHeaderToggle() {
      setNavOpen((open) => !open);
    }
    window.addEventListener(ACCOUNT_MOBILE_NAV_TOGGLE_EVENT, onHeaderToggle);
    return () => window.removeEventListener(ACCOUNT_MOBILE_NAV_TOGGLE_EVENT, onHeaderToggle);
  }, []);

  useEffect(() => {
    if (navOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.removeProperty("overflow");
      };
    }
    return undefined;
  }, [navOpen]);

  return (
    <>
      {navOpen ? (
        <button
          type="button"
          className="dashboard-nav-backdrop"
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
        />
      ) : null}
      <main className={`account-main${navOpen ? " account-main--nav-open" : ""}`}>
        <div className="dashboard-nav-toolbar dashboard-nav-toolbar--inline">
          <DashboardNavMenuButton
            expanded={navOpen}
            onClick={() => setNavOpen((open) => !open)}
            label="Open account menu"
          />
        </div>
        <aside className="account-nav-slot account-nav-slot--drawer" aria-label="Account">
          <div className="account-nav">
            <SideMenu key={pathname} sections={SECTIONS} pathname={pathname} />
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="side-menu-signout">
                Sign out
              </button>
            </form>
          </div>
        </aside>
        {bare ? (
          <section className="account-panel account-panel--bare">{children}</section>
        ) : (
          <section className="card account-panel">
            <h1>{title}</h1>
            {lead ? <p className="lead">{lead}</p> : null}
            {children}
          </section>
        )}
      </main>
    </>
  );
}

export function AccountState({
  loading,
  error,
  empty,
  children,
}: {
  loading?: boolean;
  error?: string | null;
  empty?: string | null;
  children?: ReactNode;
}) {
  if (loading) return <p className="account-state">Loading…</p>;
  if (error) return <p className="form-error">{error}</p>;
  if (empty) return <p className="empty-state">{empty}</p>;
  return <>{children}</>;
}
