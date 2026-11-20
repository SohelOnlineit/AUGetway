"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { EmailSectionNav } from "@/components/admin/EmailSectionNav";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch } from "@/lib/admin/api";

type ShopId = "amarpin" | "uniqbd";
type ChannelId = "orders" | "support" | "system" | "admin";

type Channel = {
  fromName: string;
  fromEmail: string;
  smtpUser: string;
  replyTo: string;
  hasPassword: boolean;
  usernameMasked: string;
};

type ShopSettings = {
  enabled: boolean;
  mockMode: boolean;
  customerOrderEmails: boolean;
  adminOrderAlerts: boolean;
  host: string;
  port: number;
  secure: boolean;
  channels: Record<ChannelId, Channel>;
  overview: {
    fromName: string;
    fromEmail: string;
    host: string;
    port: number;
    secure: boolean;
    usernameMasked: string;
    mailboxEnabled: boolean;
    liveSending: boolean;
    provider: string;
    passwordSaved: boolean;
    configured: boolean;
  };
};

type Settings = {
  shops: Record<ShopId, ShopSettings>;
};

const SHOPS: Array<{ id: ShopId; label: string; domain: string }> = [
  { id: "amarpin", label: "AuGetway", domain: "amarpin.com" },
  { id: "uniqbd", label: "UniQbd", domain: "uniqbd.com" },
];

const CHANNELS: Array<{ id: ChannelId; label: string }> = [
  { id: "orders", label: "Orders" },
  { id: "support", label: "Support" },
  { id: "system", label: "System" },
  { id: "admin", label: "All Admin" },
];

const EMPTY_CHANNEL: Channel = {
  fromName: "AuGetway",
  fromEmail: "",
  smtpUser: "",
  replyTo: "",
  hasPassword: false,
  usernameMasked: "Not set",
};

export default function EmailSettingsPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [shop, setShop] = useState<ShopId>("amarpin");
  const [channel, setChannel] = useState<ChannelId>("orders");
  const [password, setPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const result = await adminFetch<Settings>("/email/settings");
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSettings(result.data);
    setError(null);
  }, []);

  useEffect(() => {
    if (loading || sessionError) return;
    void load();
  }, [load, loading, sessionError]);

  async function save(next: Settings, shopId: ShopId = shop, pass?: string) {
    setPending(true);
    setNotice(null);
    const form = next.shops[shopId];
    const active = form.channels[channel];
    const result = await adminFetch<Settings>("/email/settings", {
      method: "PATCH",
      body: JSON.stringify({
        shop: shopId,
        enabled: form.enabled,
        mockMode: form.mockMode,
        customerOrderEmails: form.customerOrderEmails,
        adminOrderAlerts: form.adminOrderAlerts,
        host: form.host,
        port: Number(form.port) || 465,
        secure: form.secure,
        channel,
        fromName: active.fromName,
        fromEmail: active.fromEmail,
        smtpUser: active.smtpUser,
        replyTo: active.replyTo,
        ...(pass ? { smtpPass: pass } : {}),
      }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      await load();
      return;
    }
    setSettings(result.data);
    setPassword("");
    setChangingPassword(false);
    setError(null);
    setNotice(`${SHOPS.find((item) => item.id === shop)?.label} email settings saved.`);
  }

  function patch(partial: Partial<ShopSettings>, autosave = false) {
    if (!settings) return;
    const next: Settings = {
      shops: {
        ...settings.shops,
        [shop]: { ...settings.shops[shop], ...partial },
      },
    };
    setSettings(next);
    if (autosave) void save(next, shop);
  }

  function patchChannel(partial: Partial<Channel>) {
    setSettings((current) => {
      if (!current) return current;
      const form = current.shops[shop];
      return {
        shops: {
          ...current.shops,
          [shop]: {
            ...form,
            channels: {
              ...form.channels,
              [channel]: { ...form.channels[channel], ...partial },
            },
          },
        },
      };
    });
  }

  async function testConnection() {
    if (!settings) return;
    setPending(true);
    setNotice(null);
    const result = await adminFetch<{ message: string }>("/email/test-connection", {
      method: "POST",
      body: JSON.stringify({ shop, channel }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    setNotice(result.data.message);
  }

  async function sendTest() {
    setPending(true);
    setNotice(null);
    const result = await adminFetch<{ message: string }>("/email/test-message", {
      method: "POST",
      body: JSON.stringify({ shop, channel, to: recipient }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    setNotice(result.data.message);
  }

  const form = settings?.shops[shop];
  const active = form?.channels[channel] ?? { ...EMPTY_CHANNEL, fromName: shop === "uniqbd" ? "UniQbd" : "AuGetway" };
  const overview = form?.overview;
  const site = SHOPS.find((item) => item.id === shop)!;

  return (
    <AdminShell title="Email / SMTP" permissions={permissions} bare>
      {sessionError || error ? <p className="form-error">{sessionError || error}</p> : null}
      {!settings || !form ? (
        <p className="mail-loading">{sessionError ? "" : "Loading email settings…"}</p>
      ) : (
        <div className="mail-page">
          <header className="mail-hero">
            <span className="mail-hero-icon" aria-hidden>
              <span className="mail-ring" />
              <MailIcon />
            </span>
            <div>
              <p>Settings</p>
              <h1>Email / SMTP</h1>
              <p>Each shop sends from its own mailbox. AuGetway and UniQbd never share a password.</p>
            </div>
          </header>
          <EmailSectionNav />
          <div className="mail-shops" role="tablist" aria-label="Site">
            {SHOPS.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={item.id === shop}
                className={item.id === shop ? "is-on" : ""}
                style={{ animationDelay: `${index * 80}ms` }}
                onClick={() => {
                  setShop(item.id);
                  setPassword("");
                  setChangingPassword(false);
                  setNotice(null);
                  setError(null);
                }}
              >
                <span className={`mail-mark mail-mark--${item.id}`} aria-hidden>
                  <span className="mail-ring" />
                  {item.id === "uniqbd" ? <GlobeIcon /> : <PinIcon />}
                </span>
                <span>
                  <strong>{item.label}</strong>
                  <em>{item.domain}</em>
                </span>
              </button>
            ))}
          </div>
          <section className="mail-overview">
            <header className="mail-card-head">
              <span className="mail-stat-icon" aria-hidden>
                <MailIcon />
              </span>
              <div>
                <h2>Email overview · {site.label}</h2>
                <p>{overview?.configured ? "SMTP configured · live sending" : "SMTP is not configured yet"}</p>
              </div>
            </header>
            <div className="mail-stats">
              <article className="is-brand">
                <span className="mail-stat-icon" aria-hidden><AtIcon /></span>
                <div>
                  <span>From</span>
                  <strong>{overview?.fromName || site.label}</strong>
                  <em>{overview?.fromEmail || "Not set"}</em>
                </div>
              </article>
              <article className={overview?.host ? "is-brand" : "is-amber"}>
                <span className="mail-stat-icon" aria-hidden><ServerIcon /></span>
                <div>
                  <span>SMTP host</span>
                  <strong>{overview?.host || "Not set"}</strong>
                  <em>Custom SMTP</em>
                </div>
              </article>
              <article className={overview?.secure ? "is-success" : ""}>
                <span className="mail-stat-icon" aria-hidden><LockIcon /></span>
                <div>
                  <span>Port</span>
                  <strong>{overview?.port || 465}</strong>
                  <em>{overview?.secure ? "TLS enabled" : "Plain"}</em>
                </div>
              </article>
              <article className={overview?.passwordSaved ? "is-success" : "is-amber"}>
                <span className="mail-stat-icon" aria-hidden><KeyIcon /></span>
                <div>
                  <span>Username</span>
                  <strong>{overview?.usernameMasked || "Not set"}</strong>
                  <em>{overview?.passwordSaved ? "Password saved" : "No password yet"}</em>
                </div>
              </article>
            </div>
            <div className="mail-pills">
              <span className={overview?.mailboxEnabled ? "is-on" : ""}>{overview?.mailboxEnabled ? "Mailbox enabled" : "Mailbox off"}</span>
              <span className={overview?.liveSending ? "is-on" : ""}>{overview?.liveSending ? "Live sending" : "Mock mode"}</span>
              <span className="is-on">Provider {overview?.provider}</span>
              <span className={overview?.passwordSaved ? "is-on" : ""}>{overview?.passwordSaved ? "Password saved" : "Password missing"}</span>
            </div>
          </section>

          <div className="mail-layout">
            <div className="mail-main">
              <section className="mail-card">
                <header className="mail-card-head">
                  <span className="mail-stat-icon" aria-hidden><ServerIcon /></span>
                  <div>
                    <h2>SMTP configuration · {site.label}</h2>
                    <p>Mail from {site.domain} uses this mailbox. The other site keeps its own settings.</p>
                  </div>
                  <div className="mail-pills">
                    <span className={form.enabled ? "is-on" : ""}>{form.enabled ? "Save enabled" : "Disabled"}</span>
                    <span className={!form.mockMode ? "is-on" : ""}>{form.mockMode ? "Mock" : "Live sending"}</span>
                    <span className={overview?.configured ? "is-on" : ""}>{overview?.configured ? "SMTP configured" : "Not configured"}</span>
                  </div>
                </header>
                <Toggle
                  label="Email enabled"
                  hint="Required for any outbound email. Use the toggles below to control customer and admin mail separately."
                  pressed={form.enabled}
                  onClick={() => patch({ enabled: !form.enabled }, true)}
                />
                <Toggle
                  label="Mock mode"
                  hint="On — do not send real messages."
                  pressed={form.mockMode}
                  onClick={() => patch({ mockMode: !form.mockMode }, true)}
                />
                <Toggle
                  label="Customer order emails"
                  hint="Send order emails to buyers when an order is paid, processing, completed, cancelled, or refunded."
                  pressed={form.customerOrderEmails}
                  onClick={() => patch({ customerOrderEmails: !form.customerOrderEmails }, true)}
                />
                <Toggle
                  label="Admin new order alerts"
                  hint="Email the team when a pending order is placed, separate from the customer email."
                  pressed={form.adminOrderAlerts}
                  onClick={() => patch({ adminOrderAlerts: !form.adminOrderAlerts }, true)}
                />
                <label className="mail-field">
                  <span>Default from address</span>
                  <input
                    value={active.fromEmail ? `${active.fromName} <${active.fromEmail}>` : active.fromName}
                    onChange={(event) => {
                      const parsed = parseFrom(event.target.value, site.label);
                      patchChannel(parsed);
                    }}
                  />
                </label>
              </section>

              <section className="mail-card">
                <header className="mail-card-head">
                  <span className="mail-stat-icon" aria-hidden><AtIcon /></span>
                  <div>
                    <h2>Sender accounts</h2>
                    <p>Choose a mailbox and save the username, from name, and reply-to for that account.</p>
                  </div>
                </header>
                <div className="mail-tabs">
                  {CHANNELS.map((item) => (
                    <button key={item.id} type="button" className={item.id === channel ? "is-on" : ""} onClick={() => setChannel(item.id)}>
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="mail-grid">
                  <label className="mail-field">
                    <span>SMTP username</span>
                    <input value={active.smtpUser} onChange={(event) => patchChannel({ smtpUser: event.target.value })} autoComplete="off" />
                  </label>
                  <label className="mail-field">
                    <span>SMTP password</span>
                    {active.hasPassword && !changingPassword ? (
                      <button type="button" className="mail-password" onClick={() => setChangingPassword(true)}>
                        •••••••• <em>Change password</em>
                      </button>
                    ) : (
                      <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder={active.hasPassword ? "New password" : "Password"} />
                    )}
                  </label>
                  <label className="mail-field">
                    <span>From name</span>
                    <input value={active.fromName} onChange={(event) => patchChannel({ fromName: event.target.value })} />
                  </label>
                  <label className="mail-field">
                    <span>Reply-to email</span>
                    <input value={active.replyTo} onChange={(event) => patchChannel({ replyTo: event.target.value })} />
                  </label>
                </div>
                <div className="mail-server">
                  <label className="mail-field">
                    <span>SMTP host</span>
                    <input value={form.host} onChange={(event) => patch({ host: event.target.value })} placeholder="smtp.example.com" />
                  </label>
                  <label className="mail-field mail-field--port">
                    <span>Port</span>
                    <input value={form.port} onChange={(event) => patch({ port: Number(event.target.value) || 0 })} inputMode="numeric" />
                  </label>
                  <Toggle label="Use TLS (port 465)" hint="On for port 465. Port 587 connects first, then upgrades with STARTTLS." pressed={form.secure} onClick={() => patch({ secure: !form.secure })} />
                </div>
                <button type="button" className="mail-save" disabled={pending} onClick={() => settings && void save(settings, shop, password)}>
                  {pending ? "Saving…" : `Save ${site.label} SMTP`}
                </button>
              </section>
            </div>

            <aside className="mail-side">
              <section className="mail-card">
                <header className="mail-card-head">
                  <span className="mail-stat-icon" aria-hidden><SendIcon /></span>
                  <div>
                    <h2>Delivery tools</h2>
                    <p>Verify the connection and send a test email.</p>
                  </div>
                </header>
                <label className="mail-field">
                  <span>Recipient</span>
                  <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="name@email.com" />
                </label>
                <button type="button" disabled={pending} onClick={() => void testConnection()}>
                  Test connection
                </button>
                <button type="button" className="mail-save" disabled={pending || !recipient.trim()} onClick={() => void sendTest()}>
                  Send test email
                </button>
              </section>
              <section className="mail-card">
                <header className="mail-card-head">
                  <span className="mail-stat-icon" aria-hidden><LockIcon /></span>
                  <div>
                    <h2>Connection summary</h2>
                  </div>
                </header>
                <dl>
                  <div><dt>Channel</dt><dd>{CHANNELS.find((item) => item.id === channel)?.label}</dd></div>
                  <div><dt>Host</dt><dd>{form.host || "Not set"}</dd></div>
                  <div><dt>Port</dt><dd>{form.port}{form.secure ? " · TLS" : ""}</dd></div>
                  <div><dt>Username</dt><dd>{active.usernameMasked}</dd></div>
                  <div><dt>Password</dt><dd>{active.hasPassword ? "Saved" : "Not saved"}</dd></div>
                </dl>
              </section>
              {notice ? <p className="mail-notice">{notice}</p> : null}
            </aside>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

function Toggle({
  label,
  hint,
  pressed,
  onClick,
}: {
  label: string;
  hint: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <div className="mail-toggle">
      <div>
        <strong>{label}</strong>
        <p>{hint}</p>
      </div>
      <button type="button" aria-label={label} aria-pressed={pressed} onClick={onClick} />
    </div>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6h16v12H4z" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" />
      <circle cx="12" cy="11" r="2.2" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.4 2.2 3.6 5 3.6 8s-1.2 5.8-3.6 8c-2.4-2.2-3.6-5-3.6-8s1.2-5.8 3.6-8Z" />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="16" height="6" rx="1.4" />
      <rect x="4" y="14" width="16" height="6" rx="1.4" />
      <path d="M8 7h.01M8 17h.01" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="1.6" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
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

function AtIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M16 12v1.5a2.2 2.2 0 0 0 4 0V12a8 8 0 1 0-3.2 6.4" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m4 12 16-7-6 16-2.5-6.5L4 12Z" />
    </svg>
  );
}

function parseFrom(value: string, fallbackName: string): { fromName: string; fromEmail: string } {
  const match = value.match(/^(.*)<([^>]+)>$/);
  const namePart = match?.[1];
  const emailPart = match?.[2];
  if (namePart === undefined || emailPart === undefined) {
    return { fromName: value.trim() || fallbackName, fromEmail: "" };
  }
  return { fromName: namePart.trim() || fallbackName, fromEmail: emailPart.trim() };
}
