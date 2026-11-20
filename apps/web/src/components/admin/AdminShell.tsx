"use client";

import { usePathname } from "next/navigation";
import { useContext, useEffect, useState, type ReactNode } from "react";
import { AdminSessionContext, useFetchedAdminSession } from "@/hooks/useAdminSession";
import type { Permission } from "@amarpin/types";
import { can } from "@/lib/admin/api";
import { DashboardNavMenuButton } from "@/components/dashboard/DashboardNavMenuButton";
import { ADMIN_MOBILE_NAV_TOGGLE_EVENT } from "@/lib/dashboard-nav-events";
import {
  SideMenu,
  type SideMenuEntry,
  type SideMenuSection,
} from "@/components/dashboard/SideMenu";

type GuardedChild = {
  href: string;
  label: string;
  icon: import("@/components/dashboard/SideMenu").SideIcon;
  permission?: Permission;
};

type Guarded = {
  href: string;
  label: string;
  icon: import("@/components/dashboard/SideMenu").SideIcon;
  exact?: boolean;
  permission?: Permission;
  children?: GuardedChild[];
};

const SECTIONS: Array<Omit<SideMenuSection, "items"> & { items: Guarded[] }> = [
  {
    id: "overview",
    title: "Administration Menu",
    marked: true,
    items: [{ href: "/admin", label: "Dashboard", icon: "grid", exact: true }],
  },
  {
    id: "catalog",
    title: "Catalog",
    items: [
      {
        href: "/admin/products",
        label: "Products",
        icon: "box",
        children: [
          { href: "/admin/products", label: "All products", icon: "box", permission: "admin:catalog:read" },
          { href: "/admin/product-requests", label: "Product requests", icon: "box", permission: "admin:product-requests:read" },
          { href: "/admin/categories", label: "Categories", icon: "layers", permission: "admin:catalog:read" },
          { href: "/admin/brands", label: "Brands", icon: "tag", permission: "admin:catalog:read" },
          { href: "/admin/inventory", label: "Stock management", icon: "key", permission: "admin:inventory:read" },
          { href: "/admin/reviews", label: "Reviews", icon: "chat", permission: "admin:reviews:read" },
        ],
      },
    ],
  },
  {
    id: "commerce",
    title: "Commerce",
    items: [
      {
        href: "/admin/orders",
        label: "Sales",
        icon: "cart",
        children: [
          { href: "/admin/orders", label: "Orders", icon: "cart", permission: "admin:orders:read" },
          { href: "/admin/payments", label: "Payments", icon: "card", permission: "admin:payments:read" },
          { href: "/admin/refunds", label: "Refunds", icon: "receipt", permission: "admin:refunds:read" },
          { href: "/admin/coupons", label: "Coupons", icon: "ticket", permission: "admin:coupons:read" },
          { href: "/admin/points", label: "Points", icon: "ticket", permission: "admin:points:read" },
        ],
      },
    ],
  },
  {
    id: "content",
    title: "Content",
    items: [
      {
        href: "/admin/blog",
        label: "Blog",
        icon: "link",
        children: [
          { href: "/admin/blog", label: "Posts", icon: "file", permission: "admin:content:read" },
          { href: "/admin/contact", label: "Contact inbox", icon: "mail", permission: "admin:contact:read" },
        ],
      },
    ],
  },
  {
    id: "support",
    title: "Support",
    items: [
      {
        href: "/admin/tickets",
        label: "Support",
        icon: "headset",
        children: [
          { href: "/admin/tickets", label: "Tickets", icon: "receipt", permission: "admin:support:read" },
          { href: "/admin/chat", label: "Live chat", icon: "chat", permission: "admin:chat:access" },
        ],
      },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    items: [
      {
        href: "/admin/settings/general",
        label: "Settings",
        icon: "gear",
        children: [
          {
            href: "/admin/settings/general",
            label: "General",
            icon: "gear",
            permission: "admin:access",
          },
          {
            href: "/admin/settings/security",
            label: "Security",
            icon: "shield",
            permission: "admin:audit:read",
          },
          {
            href: "/admin/settings/roles",
            label: "Roles & permissions",
            icon: "shield",
            permission: "admin:users:write",
          },
          {
            href: "/admin/settings/payments",
            label: "Payment gateways",
            icon: "card",
            permission: "admin:payments:read",
          },
          {
            href: "/admin/settings/sms",
            label: "SMS Gateway",
            icon: "chat",
            permission: "admin:access",
          },
          {
            href: "/admin/settings/telegram",
            label: "Telegram",
            icon: "send",
            permission: "admin:access",
          },
          {
            href: "/admin/settings/contact",
            label: "Contact details",
            icon: "pin",
            permission: "admin:access",
          },
          {
            href: "/admin/messages",
            label: "Customer SMS & Email",
            icon: "chat",
            permission: "admin:access",
          },
          {
            href: "/admin/settings/email",
            label: "Email / SMTP",
            icon: "mail",
            permission: "admin:access",
          },
          {
            href: "/admin/settings/appearance",
            label: "Appearance & theme",
            icon: "image",
            permission: "admin:seo:read",
          },
          {
            href: "/admin/seo",
            label: "SEO",
            icon: "search",
            permission: "admin:seo:read",
          },
          {
            href: "/admin/cms",
            label: "Home & Slider",
            icon: "layers",
            permission: "admin:content:read",
          },
        ],
      },
    ],
  },
  {
    id: "system",
    title: "System",
    items: [
      { href: "/admin/analytics", label: "Visitor Analytics", icon: "chart", permission: "admin:analytics:read" },
      { href: "/admin/customers", label: "Customers", icon: "users", permission: "admin:customers:read" },
      { href: "/admin/wallets", label: "Wallets", icon: "wallet", permission: "admin:wallet:adjust" },
      { href: "/admin/audit", label: "Audit", icon: "shield", permission: "admin:audit:read" },
    ],
  },
];

function allowed(permission: Permission | undefined, permissions?: Permission[]) {
  return !permission || can(permissions, permission);
}

function visibleSections(permissions?: Permission[]): SideMenuSection[] {
  return SECTIONS.map((section) => ({
    ...section,
    items: section.items.flatMap((item) => {
      const children = item.children?.filter((child) =>
        allowed(child.permission, permissions),
      );
      if (item.children) {
        if (!children || children.length === 0) return [];
        return [{ ...item, href: children[0]!.href, children }];
      }
      return allowed(item.permission, permissions) ? [item] : [];
    }),
  })).filter((section) => section.items.length > 0);
}

export function AdminFrame({
  children,
  permissions,
}: {
  children: ReactNode;
  permissions?: Permission[];
}) {
  const pathname = usePathname();
  const session = useFetchedAdminSession(true, permissions);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onHeaderToggle() {
      setNavOpen((open) => !open);
    }
    window.addEventListener(ADMIN_MOBILE_NAV_TOGGLE_EVENT, onHeaderToggle);
    return () => window.removeEventListener(ADMIN_MOBILE_NAV_TOGGLE_EVENT, onHeaderToggle);
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
    <AdminSessionContext.Provider value={session}>
      {navOpen ? (
        <button
          type="button"
          className="dashboard-nav-backdrop"
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
        />
      ) : null}
      <main className={`admin-main${navOpen ? " admin-main--nav-open" : ""}`}>
        <div className="dashboard-nav-toolbar dashboard-nav-toolbar--inline">
          <DashboardNavMenuButton
            expanded={navOpen}
            onClick={() => setNavOpen((open) => !open)}
            label="Open admin menu"
          />
        </div>
        <aside className="admin-nav-slot admin-nav-slot--drawer" aria-label="Admin">
          <div className="admin-nav">
            <SideMenu sections={visibleSections(session.permissions)} pathname={pathname} />
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="side-menu-signout">
                Sign out
              </button>
            </form>
          </div>
        </aside>
        <div key={pathname} className="admin-page-in">
          {children}
        </div>
      </main>
    </AdminSessionContext.Provider>
  );
}

export function AdminShell({
  title,
  lead,
  permissions,
  bare = false,
  children,
}: {
  title: string;
  lead?: string;
  permissions?: Permission[];
  bare?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const framed = useContext(AdminSessionContext);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onHeaderToggle() {
      setNavOpen((open) => !open);
    }
    window.addEventListener(ADMIN_MOBILE_NAV_TOGGLE_EVENT, onHeaderToggle);
    return () => window.removeEventListener(ADMIN_MOBILE_NAV_TOGGLE_EVENT, onHeaderToggle);
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

  if (framed) {
    return (
      <section className={bare ? "admin-panel admin-panel--bare" : "card admin-panel"}>
        {bare ? null : <h1>{title}</h1>}
        {!bare && lead ? <p className="lead">{lead}</p> : null}
        {children}
      </section>
    );
  }

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
      <main className={`admin-main${navOpen ? " admin-main--nav-open" : ""}`}>
        <div className="dashboard-nav-toolbar dashboard-nav-toolbar--inline">
          <DashboardNavMenuButton
            expanded={navOpen}
            onClick={() => setNavOpen((open) => !open)}
            label="Open admin menu"
          />
        </div>
        <aside className="admin-nav-slot admin-nav-slot--drawer" aria-label="Admin">
          <div className="admin-nav">
            <SideMenu sections={visibleSections(permissions)} pathname={pathname} />
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="side-menu-signout">
                Sign out
              </button>
            </form>
          </div>
        </aside>
        <section className={bare ? "admin-panel admin-panel--bare" : "card admin-panel"}>
          {bare ? null : <h1>{title}</h1>}
          {!bare && lead ? <p className="lead">{lead}</p> : null}
          {children}
        </section>
      </main>
    </>
  );
}
