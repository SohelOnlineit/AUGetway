"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

export type SideIcon =
  | "grid"
  | "box"
  | "layers"
  | "tag"
  | "key"
  | "chat"
  | "cart"
  | "card"
  | "receipt"
  | "ticket"
  | "link"
  | "file"
  | "mail"
  | "search"
  | "headset"
  | "chart"
  | "users"
  | "shield"
  | "wallet"
  | "heart"
  | "bell"
  | "user"
  | "gear"
  | "image"
  | "send"
  | "pin";

export type SideMenuEntry = {
  href: string;
  label: string;
  icon: SideIcon;
  exact?: boolean;
  children?: Array<{
    href: string;
    label: string;
    icon: SideIcon;
  }>;
};

export type SideMenuSection = {
  id: string;
  title: string;
  marked?: boolean;
  items: SideMenuEntry[];
};

function matches(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SideMenu({
  sections,
  pathname,
}: {
  sections: SideMenuSection[];
  pathname: string;
}) {
  return (
    <div className="side-menu">
      {sections.map((section) => (
        <section key={section.id} className={section.marked ? "side-menu-section side-menu-section--marked" : "side-menu-section"}>
          <p className="side-menu-label">
            {section.marked ? (
              <span className="side-menu-label-icon" aria-hidden>
                <Glyph name="grid" />
              </span>
            ) : null}
            {section.title}
          </p>
          <ul>
            {section.items.map((item) => {
              const childActive = item.children?.some((child) =>
                matches(pathname, child.href),
              );
              const active =
                childActive || matches(pathname, item.href, item.exact);
              const row = (
                <>
                  {active ? <span className="side-menu-bar" aria-hidden /> : null}
                  <Link href={item.href} className="side-menu-main">
                    <span className="side-menu-icon" data-icon={item.icon} aria-hidden>
                      <Glyph name={item.icon} />
                    </span>
                    <span>{item.label}</span>
                  </Link>
                </>
              );
              if (!item.children) {
                return (
                  <li key={item.href}>
                    <div className={active ? "side-menu-row is-active" : "side-menu-row"}>{row}</div>
                  </li>
                );
              }
              return (
                <li key={item.href}>
                  <MenuGroup active={active} openForRoute={Boolean(childActive)} row={row}>
                    <ul className="side-menu-sub">
                      {item.children.map((child) => {
                        const on = matches(pathname, child.href);
                        return (
                          <li key={child.href}>
                            <Link href={child.href} className={on ? "is-active" : undefined}>
                              <span className="side-menu-sub-icon" data-icon={child.icon} aria-hidden>
                                <Glyph name={child.icon} />
                              </span>
                              {child.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </MenuGroup>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function MenuGroup({
  active,
  openForRoute,
  row,
  children,
}: {
  active: boolean;
  openForRoute: boolean;
  row: ReactNode;
  children: ReactNode;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (detailsRef.current && openForRoute) detailsRef.current.open = true;
  }, [openForRoute]);

  return (
    <details ref={detailsRef} className="side-menu-details" open={openForRoute ? true : undefined}>
      <summary className={active ? "side-menu-row is-active" : "side-menu-row"}>
        {row}
        <span className="side-menu-chevron" aria-hidden>
          <Chevron />
        </span>
      </summary>
      {children}
    </details>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path
        d="M6 9l6 6 6-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Glyph({ name }: { name: SideIcon }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <GlyphPaths name={name} />
    </svg>
  );
}

function GlyphPaths({ name }: { name: SideIcon }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "grid":
      return (
        <>
          <rect {...common} x="4" y="4" width="6.5" height="6.5" rx="1.4" />
          <rect {...common} x="13.5" y="4" width="6.5" height="6.5" rx="1.4" />
          <rect {...common} x="4" y="13.5" width="6.5" height="6.5" rx="1.4" />
          <rect {...common} x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4" />
        </>
      );
    case "box":
      return (
        <path
          {...common}
          d="M4 8l8-4 8 4-8 4-8-4zm0 0v8l8 4 8-4V8M12 12v8"
        />
      );
    case "layers":
      return <path {...common} d="M12 4l8 4-8 4-8-4 8-4zm-8 8l8 4 8-4M4 16l8 4 8-4" />;
    case "tag":
      return (
        <path
          {...common}
          d="M4 12l8-8h6v6l-8 8-6-6zm10-4.5h.01"
        />
      );
    case "key":
      return <path {...common} d="M8 15a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm3-3h9l-2 2 2 2" />;
    case "chat":
      return <path {...common} d="M5 6h14v9H8l-3 3V6z" />;
    case "cart":
      return <path {...common} d="M5 6h2l2 10h9l2-7H8M9 20h.01M18 20h.01" />;
    case "card":
      return <path {...common} d="M4 8h16v9H4zM4 12h16" />;
    case "receipt":
      return <path {...common} d="M7 4h10v16l-2-1.5L13 20l-2-1.5L9 20l-2-1.5V4zM9 8h6M9 12h6" />;
    case "ticket":
      return <path {...common} d="M4 8a2 2 0 0 0 2-2h12a2 2 0 0 0 2 2v2a2 2 0 0 1 0 4v2a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2v-2a2 2 0 0 1 0-4V8z" />;
    case "link":
      return <path {...common} d="M10 14l4-4M9 8H7a4 4 0 0 0 0 8h2M15 8h2a4 4 0 0 1 0 8h-2" />;
    case "file":
      return <path {...common} d="M7 4h7l5 5v11H7zM14 4v5h5" />;
    case "mail":
      return <path {...common} d="M4 7h16v10H4zM4 7l8 6 8-6" />;
    case "search":
      return <path {...common} d="M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zm5-2l3 3" />;
    case "headset":
      return <path {...common} d="M5 13a7 7 0 0 1 14 0M5 13v4a2 2 0 0 0 2 2h1v-6H7a2 2 0 0 0-2 2zm14 0v4a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2z" />;
    case "chart":
      return <path {...common} d="M5 19V9M12 19V5M19 19v-7" />;
    case "users":
      return <path {...common} d="M9 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7 1a2.5 2.5 0 1 0 0-5M4 19a5 5 0 0 1 10 0M16 19a4 4 0 0 1 3-3.8" />;
    case "shield":
      return <path {...common} d="M12 3l7 3v6c0 4.5-3 7-7 9-4-2-7-4.5-7-9V6l7-3z" />;
    case "wallet":
      return <path {...common} d="M4 8h16v10H4zM4 8l2-3h10M16 13h3" />;
    case "heart":
      return <path {...common} d="M12 19s-7-4.2-7-8.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8C19 14.8 12 19 12 19z" />;
    case "bell":
      return <path {...common} d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16zM10 18a2 2 0 0 0 4 0" />;
    case "user":
      return <path {...common} d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0" />;
    case "image":
      return (
        <path
          {...common}
          d="M5 6h14v12H5zM8 14l2.2-2.2 1.6 1.6L15 10l3 4M9 9.5h.01"
        />
      );
    case "send":
      return <path {...common} d="M4 12 20 4l-6 16-2.5-6.5L4 12z" />;
    case "pin":
      return (
        <>
          <path {...common} d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z" />
          <circle {...common} cx="12" cy="11" r="1.6" />
        </>
      );
    case "gear":
      return (
        <path
          {...common}
          d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM12 3.5v2M12 18.5v2M4.8 6.5l1.7 1M17.5 16.5l1.7 1M3.5 12h2M18.5 12h2M4.8 17.5l1.7-1M17.5 7.5l1.7-1"
        />
      );
    default:
      return null;
  }
}
