"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { PublicSiteContent } from "@amarpin/types";
import { CART_COUNT_EVENT, publishCartCount } from "@/lib/cart-count";
import { ACCOUNT_MOBILE_NAV_TOGGLE_EVENT, ADMIN_MOBILE_NAV_TOGGLE_EVENT, isAccountPanel } from "@/lib/dashboard-nav-events";
import { applyTheme } from "@/lib/theme/theme";

const PRIMARY = [
  { label: "Home", href: "/" },
  { label: "Shop", href: "/products" },
  { label: "Contact us", href: "/contact" },
] as const;

function profileNames(displayName: string | null | undefined, email: string | null | undefined) {
  const full = displayName?.trim() || "";
  const first = full.split(/\s+/).find(Boolean) || "";
  const local = email?.split("@")[0]?.trim() || "";
  return { full: full || local, first: first || local };
}

function isActive(href: string, pathname: string) {
  const path = href.split("?")[0] || "/";
  if (href.includes("?")) return false;
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function SiteHeader({
  site,
  cartCount,
  accountName,
  accountId,
  loggedIn,
  isStaff,
  roleLabel,
}: {
  site: PublicSiteContent;
  cartCount: number;
  accountName: string;
  accountId: string;
  loggedIn: boolean;
  isStaff: boolean;
  roleLabel: string;
}) {
  const pathname = usePathname();
  return (
    <HeaderBar
      site={site}
      cartCount={cartCount}
      accountName={accountName}
      accountId={accountId}
      loggedIn={loggedIn}
      isStaff={isStaff}
      roleLabel={roleLabel}
      pathname={pathname}
    />
  );
}

function HeaderBar({
  site,
  cartCount,
  accountName,
  accountId,
  loggedIn,
  isStaff,
  roleLabel,
  pathname,
}: {
  site: PublicSiteContent;
  cartCount: number;
  accountName: string;
  accountId: string;
  loggedIn: boolean;
  isStaff: boolean;
  roleLabel: string;
  pathname: string;
}) {
  const router = useRouter();
  const [count, setCount] = useState(cartCount);
  const [account, setAccount] = useState({
    accountName,
    headerName: "",
    accountId,
    isStaff,
    roleLabel,
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDetailsElement>(null);
  const isAdminPanel = pathname === "/admin" || pathname.startsWith("/admin/");
  const accountPanel = isAccountPanel(pathname);

  useEffect(() => {
    setSearchOpen(false);
    setMenuOpen(false);
    setAccountOpen(false);
    if (accountRef.current) accountRef.current.open = false;
  }, [pathname]);

  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    void fetch("/api/account/profile", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const profile = (await response.json()) as {
          id?: string;
          email?: string;
          displayName?: string | null;
          roles?: string[];
        };
        if (cancelled) return;
        const roles = profile.roles ?? [];
        const named = profileNames(profile.displayName, profile.email);
        setAccount({
          accountName: named.full || accountName,
          headerName: named.first || named.full,
          accountId: profile.id ?? "",
          isStaff: roles.includes("ADMINISTRATOR") || roles.includes("EDITOR"),
          roleLabel: roles.includes("ADMINISTRATOR")
            ? "ADMIN"
            : roles.includes("EDITOR")
              ? "EDITOR"
              : "CUSTOMER",
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loggedIn, accountName]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/cart", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const cart = (await response.json()) as { itemCount?: number };
        if (!cancelled && typeof cart.itemCount === "number") {
          setCount(cart.itemCount);
          publishCartCount(cart.itemCount);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    function onCount(event: Event) {
      const detail = (event as CustomEvent<number>).detail;
      if (typeof detail === "number") setCount(detail);
    }
    window.addEventListener(CART_COUNT_EVENT, onCount);
    return () => window.removeEventListener(CART_COUNT_EVENT, onCount);
  }, []);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      const menu = accountRef.current;
      if (!menu?.open) return;
      const target = event.target as Node;
      if (!menu.contains(target)) menu.open = false;
    }
    document.addEventListener("click", onPointer);
    return () => document.removeEventListener("click", onPointer);
  }, []);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const query = term.trim();
    router.push(query ? `/search?q=${encodeURIComponent(query)}` : "/search");
    setSearchOpen(false);
  }

  return (
    <header className={isAdminPanel ? "site-header site-header--admin" : "site-header"}>
      <div className="site-header-inner">
        <div className="site-header-brand">
          <button
            type="button"
            className="shell-icon-btn site-header-menu"
            aria-label={
              isAdminPanel
                ? "Open admin menu"
                : accountPanel
                  ? "Open account menu"
                  : menuOpen
                    ? "Close menu"
                    : "Open menu"
            }
            aria-expanded={isAdminPanel || accountPanel ? false : menuOpen}
            onClick={() => {
              if (isAdminPanel) {
                window.dispatchEvent(new CustomEvent(ADMIN_MOBILE_NAV_TOGGLE_EVENT));
                return;
              }
              if (accountPanel) {
                setMenuOpen(false);
                window.dispatchEvent(new CustomEvent(ACCOUNT_MOBILE_NAV_TOGGLE_EVENT));
                return;
              }
              setMenuOpen((open) => !open);
            }}
          >
            <MenuIcon />
          </button>
          <button
            type="button"
            className="shell-icon-btn site-search-btn site-search-mobile"
            aria-label="Search"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((open) => !open)}
          >
            <SearchIcon />
          </button>
          <Link href="/" className="site-logo" aria-label={site.siteName}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={site.lightLogoPath || (site.siteName === "UniQbd" ? "/logo/uniqbd-logo-light.png" : "/logo/amarpin-logo-light.png")}
              alt={site.logoAlt || site.siteName}
              className="site-logo-img site-logo-img--light"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={site.darkLogoPath || (site.siteName === "UniQbd" ? "/logo/uniqbd-logo-dark.png" : "/logo/amarpin-logo-dark.png")}
              alt=""
              className="site-logo-img site-logo-img--dark"
            />
          </Link>
        </div>

        <nav className="site-nav" aria-label="Primary">
          {PRIMARY.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={
                isActive(item.href, pathname)
                  ? "site-nav-link site-nav-link--active"
                  : "site-nav-link"
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="site-header-tools">
          {isAdminPanel && account.isStaff ? <ClearCacheButton /> : null}
          <button
            type="button"
            className="shell-icon-btn site-search-btn site-search-desktop"
            aria-label="Search"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((open) => !open)}
          >
            <SearchIcon />
          </button>
          <CartLink count={count} className="shell-icon-btn site-cart-btn site-cart-desktop" />
          {loggedIn ? null : <HeaderThemeButton />}
          <div className="site-account">
            {loggedIn ? (
              <details className="site-account-details" ref={accountRef}>
                <summary className="site-account-btn" aria-label="Account menu">
                  <span className="shell-icon-btn site-user-btn" aria-hidden>
                    <UserIcon />
                  </span>
                  {account.headerName ? (
                    <span className="site-account-name">{account.headerName}</span>
                  ) : null}
                  <ChevronIcon open={accountOpen} />
                </summary>
                <AccountMenu
                  name={account.accountName}
                  roleLabel={account.roleLabel}
                  isStaff={account.isStaff}
                  onClose={() => {
                    if (accountRef.current instanceof HTMLDetailsElement) accountRef.current.open = false;
                  }}
                />
              </details>
            ) : (
              <Link href="/login" className="site-account-btn" aria-label="Sign in">
                <span className="shell-icon-btn site-user-btn" aria-hidden>
                  <UserIcon />
                </span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {searchOpen ? (
        <form className="site-header-search" onSubmit={submitSearch} role="search">
          <label className="sr-only" htmlFor="header-search">
            Search products
          </label>
          <input
            id="header-search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search products…"
            autoFocus
          />
          <button type="submit" className="site-nav-link site-nav-link--active">
            Search
          </button>
        </form>
      ) : null}

      {menuOpen
        ? createPortal(
            <div className="site-mobile-drawer" role="dialog" aria-modal="true" aria-label="Menu">
              <button
                type="button"
                className="site-mobile-drawer-backdrop"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              />
              <aside className="site-mobile-drawer-panel">
                <div className="site-mobile-drawer-head">
                  <p className="site-mobile-drawer-title">Browse</p>
                  <button
                    type="button"
                    className="shell-icon-btn"
                    aria-label="Close menu"
                    onClick={() => setMenuOpen(false)}
                  >
                    <CloseIcon />
                  </button>
                </div>
                <nav className="site-mobile-drawer-scroll" aria-label="Mobile">
                  <div className="site-mobile-nav-panel">
                    <div className="site-mobile-section-head">
                      <span className="site-mobile-section-icon" aria-hidden>
                        <ShopIcon />
                      </span>
                      <p className="site-mobile-section-label">Store</p>
                    </div>
                    <ul className="site-mobile-nav-list">
                      {PRIMARY.map((item) => {
                        const active = isActive(item.href, pathname);
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              className={active ? "site-mobile-nav-link is-active" : "site-mobile-nav-link"}
                              onClick={() => setMenuOpen(false)}
                            >
                              <span className="site-mobile-nav-icon" aria-hidden>
                                <MobileNavIcon href={item.href} />
                              </span>
                              <span>{item.label}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                    <HeaderThemeButton drawer />
                  </div>
                </nav>
              </aside>
            </div>,
            document.body,
          )
        : null}
    </header>
  );
}

function ClearCacheButton() {
  const [busy, setBusy] = useState(false);

  async function clearCache() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/clear-cache", { method: "POST" });
      if (!response.ok) {
        setBusy(false);
        return;
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
      window.location.reload();
    } catch {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={busy ? "shell-icon-btn site-cache-btn is-clearing" : "shell-icon-btn site-cache-btn"}
      aria-label={busy ? "Clearing cache" : "Clear cache"}
      title="Clear cache"
      disabled={busy}
      onClick={() => void clearCache()}
    >
      <CacheIcon />
    </button>
  );
}

function CacheIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="6.2" rx="1.6" strokeWidth="2" />
      <rect x="3.5" y="14.3" width="17" height="6.2" rx="1.6" strokeWidth="2" />
      <circle cx="7.2" cy="6.6" r="1" fill="currentColor" stroke="none" />
      <circle cx="7.2" cy="17.4" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <circle cx="11" cy="11" r="6.5" strokeWidth="2" />
      <path d="M16 16l4.2 4.2" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CartLink({ count, className }: { count: number; className: string }) {
  return (
    <Link
      href="/cart"
      className={className}
      aria-label={count > 0 ? `Cart, ${count} items` : "Cart"}
    >
      <CartIcon />
      {count > 0 ? <span className="site-cart-count">{count > 9 ? "9+" : count}</span> : null}
    </Link>
  );
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 7h15l-1.5 9h-12L5 4H2"
      />
      <circle cx="9" cy="20" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18" cy="20" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <circle cx="12" cy="8" r="3.2" strokeWidth="1.7" />
      <path
        d="M5.5 19.2c1.4-3 3.6-4.4 6.5-4.4s5.1 1.4 6.5 4.4"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path strokeWidth="2" strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path strokeWidth="2" strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function MobileNavIcon({ href }: { href: string }) {
  if (href === "/") return <HomeGridIcon />;
  if (href === "/products") return <ShopIcon />;
  return <MailIcon />;
}

function HomeGridIcon() {
  return strokeIcon("M4 4h6.5v6.5H4V4zM13.5 4H20v6.5h-6.5V4zM4 13.5h6.5V20H4v-6.5zM13.5 13.5H20V20h-6.5v-6.5z");
}

function ShopIcon() {
  return strokeIcon("M4 4h16l1 5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0l1-5zM5 11v9h14v-9M9 20v-5h6v5");
}

function MailIcon() {
  return strokeIcon("M4 6.5h16v11H4v-11zM4 8l8 6 8-6");
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={open ? "site-nav-chevron site-nav-chevron--open" : "site-nav-chevron"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden
    >
      <path strokeWidth="2" strokeLinecap="round" d="M6 9l6 6 6-6" />
    </svg>
  );
}

function AccountMenu({
  name,
  roleLabel,
  isStaff,
  onClose,
}: {
  name: string;
  roleLabel: string;
  isStaff: boolean;
  onClose: () => void;
}) {
  return (
    <div className="account-menu" role="menu">
      <div className="account-menu-head">
        <div>
          <p className="account-menu-name">{name}</p>
          <p className="account-menu-role">{roleLabel}</p>
        </div>
        <HeaderThemeButton ring />
      </div>
      <div className="account-menu-body">
        <p className="account-menu-label">Dashboards</p>
        <Link href="/dashboard" className="account-menu-item" role="menuitem" onClick={onClose}>
          <span className="account-menu-item-icon">
            <MenuUserIcon />
          </span>
          My Dashboard
        </Link>
        {isStaff ? (
          <Link href="/admin" className="account-menu-item" role="menuitem" onClick={onClose}>
            <span className="account-menu-item-icon">
              <GridIcon />
            </span>
            Admin dashboard
          </Link>
        ) : null}
        <div className="account-menu-divider" />
        <p className="account-menu-label">Account</p>
        <Link href="/profile" className="account-menu-item" role="menuitem" onClick={onClose}>
          <span className="account-menu-item-icon">
            <MenuUserIcon />
          </span>
          Profile Settings
        </Link>
        <Link href="/orders" className="account-menu-item" role="menuitem" onClick={onClose}>
          <span className="account-menu-item-icon">
            <OrdersIcon />
          </span>
          Orders
        </Link>
        <Link href="/notifications" className="account-menu-item" role="menuitem" onClick={onClose}>
          <span className="account-menu-item-icon">
            <BellIcon />
          </span>
          Notifications
        </Link>
        <Link href="/wishlist" className="account-menu-item" role="menuitem" onClick={onClose}>
          <span className="account-menu-item-icon">
            <HeartIcon />
          </span>
          Wishlist
        </Link>
        <div className="account-menu-divider" />
        <form action="/api/auth/logout" method="post" className="account-menu-logout">
          <button type="submit" className="account-menu-item account-menu-item--danger" role="menuitem">
            <span className="account-menu-item-icon">
              <LogoutIcon />
            </span>
            Logout
          </button>
        </form>
      </div>
    </div>
  );
}

function HeaderThemeButton({
  labeled = false,
  ring = false,
  drawer = false,
}: {
  labeled?: boolean;
  ring?: boolean;
  drawer?: boolean;
}) {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    const read = () => setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    read();
    window.addEventListener("uq-theme-change", read);
    return () => window.removeEventListener("uq-theme-change", read);
  }, []);

  function toggle() {
    setSpinning(true);
    applyTheme(theme === "dark" ? "LIGHT" : "DARK");
    window.setTimeout(() => setSpinning(false), 500);
  }

  const dark = theme === "dark";

  return (
    <button
      type="button"
      className={
        [
          drawer
            ? "site-mobile-nav-link site-mobile-theme"
            : labeled
              ? "site-nav-link site-mobile-theme"
              : ring
                ? "account-menu-theme"
                : "shell-icon-btn header-theme-btn",
          spinning ? "is-switching" : "",
        ]
          .filter(Boolean)
          .join(" ")
      }
      aria-label={dark ? "Dark mode. Tap to switch to light mode" : "Light mode. Tap to switch to dark mode"}
      onClick={toggle}
    >
      {drawer ? (
        <span className="site-mobile-nav-icon" aria-hidden>
          <span className="header-theme-icon" key={theme}>
            {dark ? <MoonIcon /> : <SunIcon />}
          </span>
        </span>
      ) : (
        <span className="header-theme-icon" key={theme}>
          {dark ? <MoonIcon /> : <SunIcon />}
        </span>
      )}
      {drawer || labeled ? (dark ? "Dark mode" : "Light mode") : null}
    </button>
  );
}

function strokeIcon(path: string) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

function MenuUserIcon() {
  return strokeIcon("M12 12a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4zM5.5 19.2c1.3-2.8 3.5-4.2 6.5-4.2s5.2 1.4 6.5 4.2");
}

function GridIcon() {
  return strokeIcon("M5 5h5.5v5.5H5V5zM13.5 5H19v5.5h-5.5V5zM5 13.5h5.5V19H5v-5.5zM13.5 13.5H19V19h-5.5v-5.5z");
}

function OrdersIcon() {
  return strokeIcon("M7 4.5h10v15l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2V4.5zM9 9h6M9 12.5h6");
}

function BellIcon() {
  return strokeIcon("M6.5 16.5h11l-1.1-1.6V10a4.4 4.4 0 10-8.8 0v4.9L6.5 16.5zM10 18.2a2 2 0 004 0");
}

function HeartIcon() {
  return strokeIcon("M12 19.2s-6.2-3.8-6.2-8.1A3.5 3.5 0 0112 8.4a3.5 3.5 0 016.2 2.7c0 4.3-6.2 8.1-6.2 8.1z");
}

function LogoutIcon() {
  return strokeIcon("M10 7V5.5A1.5 1.5 0 0111.5 4h7A1.5 1.5 0 0120 5.5v13a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 0110 18.5V17M4 12h10M7 9l-3 3 3 3");
}

function SunIcon() {
  return strokeIcon("M12 16.2A4.2 4.2 0 1012 7.8a4.2 4.2 0 000 8.4zM12 3.5v1.6M12 18.9v1.6M4.6 4.6l1.1 1.1M18.3 18.3l1.1 1.1M3.5 12h1.6M18.9 12h1.6M4.6 19.4l1.1-1.1M18.3 5.7l1.1-1.1");
}

function MoonIcon() {
  return strokeIcon("M15.5 14.8A6.2 6.2 0 1110.2 5 5 5 0 0015.5 14.8z");
}
