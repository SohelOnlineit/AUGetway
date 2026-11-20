"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Permission } from "@amarpin/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { can } from "@/lib/admin/api";

const SHORTCUTS: Array<{
  href: string;
  label: string;
  hint: string;
  permission: Permission;
  icon: ReactNode;
}> = [
  {
    href: "/admin/settings/security",
    label: "Security",
    hint: "Signup domains, blocked IPs, and blocked countries.",
    permission: "admin:audit:read",
    icon: <ShieldIcon />,
  },
  {
    href: "/admin/settings/roles",
    label: "Roles & permissions",
    hint: "Choose what each role can open in the admin.",
    permission: "admin:users:write",
    icon: <KeyIcon />,
  },
  {
    href: "/admin/settings/payments",
    label: "Payment gateways",
    hint: "Turn gateways on and save their keys.",
    permission: "admin:payments:read",
    icon: <CardIcon />,
  },
  {
    href: "/admin/settings/sms",
    label: "SMS Gateway",
    hint: "Separate SMS keys and messages for each site.",
    permission: "admin:access",
    icon: <PhoneIcon />,
  },
  {
    href: "/admin/settings/telegram",
    label: "Telegram",
    hint: "Order and customer-message alerts for each site.",
    permission: "admin:access",
    icon: <SendIcon />,
  },
  {
    href: "/admin/settings/contact",
    label: "Contact details",
    hint: "Mobile number, address, and WhatsApp on the Contact page.",
    permission: "admin:access",
    icon: <PinIcon />,
  },
  {
    href: "/admin/messages",
    label: "Customer SMS & Email",
    hint: "One message, or a bulk send, by SMS or email.",
    permission: "admin:access",
    icon: <SendIcon />,
  },
  {
    href: "/admin/settings/email",
    label: "Email / SMTP",
    hint: "Mailboxes for AuGetway and UniQbd.",
    permission: "admin:access",
    icon: <MailIcon />,
  },
  {
    href: "/admin/settings/appearance",
    label: "Appearance & theme",
    hint: "Logos, favicon, and the look of each site.",
    permission: "admin:seo:read",
    icon: <ImageIcon />,
  },
  {
    href: "/admin/cms",
    label: "Home & Slider",
    hint: "Homepage sections and the front slider.",
    permission: "admin:content:read",
    icon: <LayersIcon />,
  },
  {
    href: "/admin/seo",
    label: "SEO",
    hint: "Titles, descriptions, and route metadata.",
    permission: "admin:seo:read",
    icon: <SearchIcon />,
  },
  {
    href: "/admin/blog",
    label: "Blog",
    hint: "Write and publish articles.",
    permission: "admin:content:read",
    icon: <PenIcon />,
  },
  {
    href: "/admin/reviews",
    label: "Reviews",
    hint: "Publish or reject customer reviews.",
    permission: "admin:reviews:read",
    icon: <StarIcon />,
  },
  {
    href: "/admin/chat",
    label: "Live chat",
    hint: "Open the support desk.",
    permission: "admin:chat:access",
    icon: <ChatIcon />,
  },
  {
    href: "/admin/customers",
    label: "Customers",
    hint: "Search accounts and open a customer profile.",
    permission: "admin:customers:read",
    icon: <UsersIcon />,
  },
  {
    href: "/admin/wallets",
    label: "Wallets",
    hint: "See balances and add or remove wallet credit.",
    permission: "admin:wallet:adjust",
    icon: <WalletIcon />,
  },
];

export default function GeneralSettingsPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const shortcuts = SHORTCUTS.filter((item) => can(permissions, item.permission));

  return (
    <AdminShell title="General" permissions={permissions} bare>
      {sessionError ? <p className="form-error">{sessionError}</p> : null}
      {loading ? (
        <p className="general-loading">{sessionError ? "" : "Loading settings…"}</p>
      ) : (
        <div className="general-page">
          <header className="general-hero">
            <span className="general-hero-icon" aria-hidden>
              <span className="general-ring" />
              <GearIcon />
            </span>
            <div>
              <p>Settings</p>
              <h1>General</h1>
              <p>Shortcuts to the website settings. Each button opens that page.</p>
            </div>
          </header>
          <div className="general-grid">
            {shortcuts.map((item, index) => (
              <Link key={item.href} href={item.href} className="general-card" style={{ animationDelay: `${index * 40}ms` }}>
                <span className="general-card-icon" aria-hidden>
                  {item.icon}
                </span>
                <span>
                  <strong>{item.label}</strong>
                  <em>{item.hint}</em>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </AdminShell>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M4.8 6.2l1.6 1.6M17.6 16.2l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.8 17.8l1.6-1.6M17.6 7.8l1.6-1.6" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5 19 6.2v5.3c0 4.2-2.8 7.2-7 8.9-4.2-1.7-7-4.7-7-8.9V6.2L12 3.5Z" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="8" cy="14" r="3.2" />
      <path d="M11 14h9l-2 2 2 2h-3" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="6" width="17" height="12" rx="2" />
      <path d="M3.5 10h17" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" />
      <circle cx="12" cy="11" r="1.6" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12 20 4l-6 16-2.5-6.5L4 12Z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="6" width="17" height="12" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.4" />
      <path d="m7 16 3.2-3.2 2.2 2.2L16 11l3 3.5" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 4 8 4-8 4-8-4 8-4Z" />
      <path d="m4 12 8 4 8-4M4 16l8 4 8-4" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h4l10-10-4-4L4 16v4Z" />
      <path d="m12.5 7.5 4 4" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 3.8 2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 9.1l5-.7L12 3.8Z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 6h14v9H8l-3 3V6Z" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="9" r="3" />
      <path d="M4 19a5 5 0 0 1 10 0" />
      <circle cx="17" cy="10" r="2.2" />
      <path d="M16 19a4 4 0 0 1 4-3.6" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="7" width="17" height="12" rx="2" />
      <path d="M3.5 10h17M16 13.5h2.5" />
    </svg>
  );
}
