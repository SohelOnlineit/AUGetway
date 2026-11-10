"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Settings = {
  brandName: string;
  supportEmail: string;
  currency: string;
  checkoutNote: string;
  prefs: Record<string, string>;
};

type Field = {
  key: string;
  label: string;
  kind?: "text" | "area" | "select" | "check" | "file";
  options?: [string, string][];
  hint?: string;
};

const cards: { id: string; title: string; description: string; icon: string; fields: Field[] }[] = [
  {
    id: "general",
    title: "General",
    description: "Configure fundamental brand information, currency and rates",
    icon: "gear",
    fields: [
      { key: "brandName", label: "Brand / System Name" },
      { key: "supportEmail", label: "Support Email" },
      { key: "supportPhone", label: "Support Phone / Helpline" },
      { key: "usdRate", label: "USD Exchange Rate (1 USD = ? BDT)" },
      { key: "currency", label: "Currency code" },
      { key: "currencySymbol", label: "Currency Symbol" },
      { key: "checkoutNote", label: "Checkout note", kind: "area" },
    ],
  },
  {
    id: "logo",
    title: "Logo & Favicon",
    description: "Upload and manage website logo, favicon and invoice branding",
    icon: "image",
    fields: [
      { key: "brandLogo", label: "Main Brand Logo", kind: "file" },
      { key: "brandFavicon", label: "Favicon Icon", kind: "file" },
    ],
  },
  {
    id: "api",
    title: "API Settings",
    description: "Configure API credentials, webhook secrets and timeouts",
    icon: "chip",
    fields: [
      { key: "apiTimeout", label: "API Request Timeout (Seconds)" },
      { key: "webhookSecret", label: "Global Webhook Signing Secret", hint: "Used for HMAC signature validation on webhooks" },
      { key: "autoRedirect", label: "Auto-redirect the customer after a successful payment", kind: "check" },
    ],
  },
  {
    id: "mail",
    title: "Mail Settings",
    description: "Configure SMTP, payment alert emails and customer receipts",
    icon: "mail",
    fields: [
      { key: "mailHost", label: "SMTP Host (e.g. smtp.gmail.com)" },
      { key: "mailPort", label: "SMTP Port" },
      { key: "mailUsername", label: "SMTP Username / Email" },
      { key: "mailPassword", label: "SMTP Password" },
      { key: "mailEncryption", label: "Encryption", kind: "select", options: [["tls", "TLS"], ["ssl", "SSL"], ["none", "None"]] },
      { key: "mailFromAddress", label: "From Email Address" },
      { key: "mailFromName", label: "From Sender Name" },
    ],
  },
  {
    id: "telegram",
    title: "Telegram Notification",
    description: "Configure Telegram Bot Token and Chat ID for instant payment alerts",
    icon: "send",
    fields: [
      { key: "telegramToken", label: "Bot Token", hint: "Enter your Telegram bot token (from @BotFather)" },
      { key: "telegramChatId", label: "Chat ID", hint: "Enter the Chat ID or Channel ID where notifications should be sent" },
      { key: "telegramNotify", label: "Send an alert when a payment succeeds", kind: "check" },
    ],
  },
  {
    id: "themes",
    title: "Themes",
    description: "Dark/Light mode switch, accent colors and checkout layouts",
    icon: "swatch",
    fields: [
      { key: "themeAccent", label: "Brand primary accent color (HEX)" },
      { key: "themeMode", label: "Admin theme mode", kind: "select", options: [["dark", "Dark Mode (Default)"], ["light", "Light Mode"], ["system", "System Auto"]] },
      { key: "checkoutTheme", label: "Checkout page layout", kind: "select", options: [["modern_dark", "Modern Fintech Dark"], ["clean_light", "Clean Minimal Light"]] },
      { key: "methodTabs", label: "Show All options, Mobile banking and Bank transfer", kind: "check", hint: "Off by default. Turn this on to show those three buttons above the payment methods." },
    ],
  },
  {
    id: "faq",
    title: "FAQ",
    description: "Manage frequently asked questions displayed on checkout",
    icon: "help",
    fields: [
      { key: "faqTitle", label: "Section Heading" },
      { key: "faqContent", label: "FAQ Items", kind: "area" },
    ],
  },
  {
    id: "seo",
    title: "SEO",
    description: "Configure meta tags, OG preview image and analytics",
    icon: "search",
    fields: [
      { key: "metaTitle", label: "Meta Title" },
      { key: "metaDescription", label: "Meta Description", kind: "area" },
      { key: "metaKeywords", label: "Meta Keywords (comma-separated)" },
    ],
  },
  {
    id: "pixel",
    title: "Meta Pixel",
    description: "Meta Pixel Server-Side CAPI tracking for Purchase events",
    icon: "chart",
    fields: [
      { key: "metaPixelId", label: "Meta Pixel ID", hint: "Enter your 15-16 digit Meta Pixel ID" },
      { key: "metaCapiToken", label: "Conversions API access token", kind: "area" },
      { key: "metaTestCode", label: "Test Event Code (Optional)", hint: "For testing events inside Facebook Events Manager" },
    ],
  },
];

const coreKeys = new Set(["brandName", "supportEmail", "currency", "checkoutNote"]);

function Icon({ name }: { name: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "gear") return <svg width="18" height="18" viewBox="0 0 24 24"><circle {...common} cx="12" cy="12" r="3" /><path {...common} d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /></svg>;
  if (name === "image") return <svg width="18" height="18" viewBox="0 0 24 24"><rect {...common} x="4" y="5" width="16" height="14" rx="2" /><circle {...common} cx="9" cy="10" r="1.4" /><path {...common} d="m8 16 3-3 2 2 3-4 2 5" /></svg>;
  if (name === "chip") return <svg width="18" height="18" viewBox="0 0 24 24"><rect {...common} x="7" y="7" width="10" height="10" rx="2" /><path {...common} d="M9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4" /></svg>;
  if (name === "mail") return <svg width="18" height="18" viewBox="0 0 24 24"><rect {...common} x="3" y="5" width="18" height="14" rx="2" /><path {...common} d="m4 7 8 6 8-6" /></svg>;
  if (name === "send") return <svg width="18" height="18" viewBox="0 0 24 24"><path {...common} d="M4 12 20 4l-6 16-2-6z" /></svg>;
  if (name === "swatch") return <svg width="18" height="18" viewBox="0 0 24 24"><path {...common} d="M12 3a9 9 0 0 0 0 18h2a2 2 0 0 0 2-2 2 2 0 0 1 2-2h1a2 2 0 0 0 2-2 9 9 0 0 0-9-12z" /><circle cx="7.5" cy="10" r="1" fill="currentColor" /><circle cx="10" cy="7" r="1" fill="currentColor" /><circle cx="14" cy="7" r="1" fill="currentColor" /></svg>;
  if (name === "help") return <svg width="18" height="18" viewBox="0 0 24 24"><circle {...common} cx="12" cy="12" r="9" /><path {...common} d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1.5 1-1.5 1.9V14" /><path {...common} d="M12 17h.01" /></svg>;
  if (name === "search") return <svg width="18" height="18" viewBox="0 0 24 24"><circle {...common} cx="11" cy="11" r="6" /><path {...common} d="m20 20-3.5-3.5" /></svg>;
  return <svg width="18" height="18" viewBox="0 0 24 24"><path {...common} d="M5 19V10M12 19V5M19 19v-7" /></svg>;
}

function readImage(file: File | undefined, onReady: (value: string) => void) {
  if (!file) return;
  if (!file.type.startsWith("image/") || file.size > 900_000) return;
  const reader = new FileReader();
  reader.onload = () => onReady(String(reader.result ?? ""));
  reader.readAsDataURL(file);
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api<Settings>("/desk/settings")
      .then(setSettings)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load"));
  }, []);

  const visible = cards.filter((card) => `${card.title} ${card.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  const open = cards.find((card) => card.id === openId) ?? null;

  function openCard(id: string) {
    if (!settings) return;
    setError("");
    setOpenId(id);
    setDraft({ ...settings.prefs, brandName: settings.brandName, supportEmail: settings.supportEmail, currency: settings.currency, checkoutNote: settings.checkoutNote });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings || !open) return;
    setPending(true);
    setError("");
    const prefs = { ...settings.prefs };
    const next = {
      brandName: settings.brandName,
      supportEmail: settings.supportEmail,
      currency: settings.currency,
      checkoutNote: settings.checkoutNote,
      prefs,
    };
    for (const field of open.fields) {
      const value = draft[field.key] ?? "";
      if (coreKeys.has(field.key)) next[field.key as "brandName"] = value;
      else prefs[field.key] = value;
    }
    try {
      setSettings(await api<Settings>("/desk/settings", { method: "POST", body: JSON.stringify(next) }));
      setOpenId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save");
    } finally {
      setPending(false);
    }
  }

  if (!settings) return <p className="muted">{error || "Loading settings…"}</p>;

  return (
    <section className="set-shell">
      <header className="set-head">
        <h2>All Settings</h2>
        <p>Adjust and fine-tune all system features and preferences</p>
      </header>
      <div className="set-body">
        <input className="set-search" value={query} placeholder="Search settings..." onChange={(event) => setQuery(event.target.value)} />
        <div className="set-grid">
          {visible.map((card) => (
            <button key={card.id} className="set-card" type="button" onClick={() => openCard(card.id)}>
              <span className="set-ico"><Icon name={card.icon} /></span>
              <span>
                <strong>{card.title}</strong>
                <p>{card.description}</p>
              </span>
            </button>
          ))}
        </div>
        {visible.length === 0 ? <p className="muted">No settings match.</p> : null}
      </div>
      {open ? (
        <div className="modal-back" onClick={() => setOpenId(null)}>
          <form className="modal set-modal" onClick={(event) => event.stopPropagation()} onSubmit={save}>
            <h2>{open.title}</h2>
            <p className="muted">{open.description}</p>
            {open.fields.map((field) => (
              <label key={field.key} className={field.kind === "check" ? "set-check" : "field"}>
                {field.kind === "check" ? (
                  <input
                    type="checkbox"
                    checked={(draft[field.key] ?? "0") === "1"}
                    onChange={(event) => setDraft({ ...draft, [field.key]: event.target.checked ? "1" : "0" })}
                  />
                ) : null}
                <span>{field.label}</span>
                {field.kind === "area" ? (
                  <textarea rows={4} value={draft[field.key] ?? ""} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })} />
                ) : null}
                {field.kind === "select" ? (
                  <select value={draft[field.key] ?? field.options?.[0]?.[0] ?? ""} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}>
                    {field.options?.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                ) : null}
                {field.kind === "file" ? (
                  <>
                    {draft[field.key]?.startsWith("data:image/") ? <img className="set-preview" src={draft[field.key]} alt="" /> : null}
                    <input type="file" accept="image/*" onChange={(event) => readImage(event.target.files?.[0], (value) => setDraft({ ...draft, [field.key]: value }))} />
                  </>
                ) : null}
                {!field.kind || field.kind === "text" ? (
                  <input value={draft[field.key] ?? ""} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })} />
                ) : null}
                {field.hint ? <p className="muted">{field.hint}</p> : null}
              </label>
            ))}
            {error ? <p className="error">{error}</p> : null}
            <div className="row">
              <button className="btn" disabled={pending} type="submit">Save</button>
              <button className="btn btn-quiet" type="button" onClick={() => setOpenId(null)}>Cancel</button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
