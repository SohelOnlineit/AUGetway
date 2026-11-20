"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch } from "@/lib/admin/api";

type ShopId = "amarpin" | "uniqbd";
type ProviderId = "sms.net.bd" | "bulksmsbd" | "greenweb" | "mimsms" | "uniqbd" | "custom";

type Template = {
  id: string;
  name: string;
  body: string;
  enabled: boolean;
  isDefault: boolean;
};

type ShopGateway = {
  enabled: boolean;
  provider: ProviderId;
  senderId: string;
  username: string;
  baseUrl: string;
  hasApiKey: boolean;
  configured: boolean;
  status: "connected" | "off" | "setup";
  providers: Array<{ id: ProviderId; label: string; hint: string }>;
  templates: Template[];
};

type SmsView = {
  shops: Record<ShopId, ShopGateway>;
};

const SHOPS: Array<{ id: ShopId; label: string; domain: string }> = [
  { id: "amarpin", label: "AuGetway", domain: "amarpin.com" },
  { id: "uniqbd", label: "UniQbd", domain: "uniqbd.com" },
];

const EMPTY_TEMPLATE: Template = { id: "", name: "", body: "", enabled: true, isDefault: false };

export default function SmsGatewayPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [view, setView] = useState<SmsView | null>(null);
  const [shop, setShop] = useState<ShopId>("amarpin");
  const [apiKey, setApiKey] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [draft, setDraft] = useState<Template | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const result = await adminFetch<SmsView>("/sms-gateway");
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setView(result.data);
      setError(null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loading, sessionError]);

  const site = SHOPS.find((item) => item.id === shop)!;
  const gateway = view?.shops[shop];
  const provider = gateway?.providers.find((item) => item.id === gateway.provider);
  const other = SHOPS.find((item) => item.id !== shop)!;

  function selectShop(next: ShopId) {
    setShop(next);
    setApiKey("");
    setDraft(null);
    setNotice(null);
    setError(null);
  }

  function patch(partial: Partial<ShopGateway>) {
    setView((current) => {
      if (!current) return current;
      return {
        shops: {
          ...current.shops,
          [shop]: { ...current.shops[shop], ...partial },
        },
      };
    });
  }

  async function saveGateway() {
    if (!gateway) return;
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await adminFetch<SmsView>("/sms-gateway", {
      method: "PATCH",
      body: JSON.stringify({
        shop,
        enabled: gateway.enabled,
        provider: gateway.provider,
        senderId: gateway.senderId,
        username: gateway.username,
        baseUrl: gateway.baseUrl,
        apiKey,
      }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setView(result.data);
    setApiKey("");
    setNotice(`${site.label} SMS gateway saved.`);
  }

  async function testConnection() {
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await adminFetch<{ message: string }>("/sms-gateway/test-connection", {
      method: "POST",
      body: JSON.stringify({ shop }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setNotice(result.data.message);
  }

  async function sendTest() {
    if (!gateway) return;
    if (!gateway.enabled) {
      setNotice(null);
      setError(`Turn on “Enabled for ${site.label}”, then send the test SMS.`);
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);
    const saved = await adminFetch<SmsView>("/sms-gateway", {
      method: "PATCH",
      body: JSON.stringify({
        shop,
        enabled: true,
        provider: gateway.provider,
        senderId: gateway.senderId,
        username: gateway.username,
        baseUrl: gateway.baseUrl,
        apiKey,
      }),
    });
    if (!saved.ok) {
      setPending(false);
      setError(saved.message);
      return;
    }
    setView(saved.data);
    setApiKey("");
    const result = await adminFetch<{ message: string }>("/sms-gateway/test-sms", {
      method: "POST",
      body: JSON.stringify({ shop, phone: testPhone }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setNotice(result.data.message);
  }

  async function saveTemplate() {
    if (!draft) return;
    setPending(true);
    setError(null);
    setNotice(null);
    const path = draft.id ? `/sms-templates/${draft.id}` : "/sms-templates";
    const result = await adminFetch<SmsView>(path, {
      method: draft.id ? "PATCH" : "POST",
      body: JSON.stringify({
        shop,
        name: draft.name,
        body: draft.body,
        enabled: draft.enabled,
      }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setView(result.data);
    setDraft(null);
    setNotice(draft.id ? `${site.label} template updated.` : `${site.label} template added.`);
  }

  const onCount = gateway?.templates.filter((template) => template.enabled).length ?? 0;

  return (
    <AdminShell title="SMS Gateway" permissions={permissions} bare>
      {sessionError || error ? <p className="form-error">{sessionError || error}</p> : null}
      {!view || !gateway ? (
        <p className="sms-loading">{sessionError ? "" : "Loading SMS settings…"}</p>
      ) : (
        <div className="sms-page">
          <header className="sms-hero">
            <span className="sms-hero-icon" aria-hidden>
              <span className="sms-ring" />
              <PhoneIcon />
            </span>
            <div>
              <p>Settings</p>
              <h1>SMS Gateway</h1>
              <p>AuGetway and UniQbd each send from their own gateway. A key saved here never crosses to the other site.</p>
            </div>
          </header>
          {notice ? <p className="sms-notice">{notice}</p> : null}
          <div className="sms-shops" role="tablist" aria-label="Site">
            {SHOPS.map((item, index) => {
              const itemGateway = view.shops[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={item.id === shop}
                  className={item.id === shop ? "is-on" : ""}
                  style={{ animationDelay: `${index * 80}ms` }}
                  onClick={() => selectShop(item.id)}
                >
                  <span className={`sms-mark sms-mark--${item.id}`} aria-hidden>
                    <span className="sms-ring" />
                    {item.id === "uniqbd" ? <GlobeIcon /> : <PinIcon />}
                  </span>
                  <span>
                    <strong>{item.label}</strong>
                    <em>
                      {item.domain} · {statusLabel(itemGateway.status)}
                    </em>
                  </span>
                </button>
              );
            })}
          </div>

          <section className="sms-overview">
            <header className="sms-card-head">
              <span className="sms-stat-icon" aria-hidden>
                <PhoneIcon />
              </span>
              <div>
                <h2>SMS overview · {site.label}</h2>
                <p>
                  {gateway.configured && gateway.enabled
                    ? `${provider?.label ?? "Gateway"} is ready to send.`
                    : `${site.label} still needs its own gateway.`}
                </p>
              </div>
            </header>
            <div className="sms-stats">
              <article className={gateway.status === "connected" ? "is-success" : gateway.status === "setup" ? "is-amber" : "is-brand"}>
                <span className="sms-stat-icon" aria-hidden>
                  <SignalIcon />
                </span>
                <div>
                  <span>Status</span>
                  <strong>{statusLabel(gateway.status)}</strong>
                  <em>{gateway.enabled ? "Sending on" : "Sending off"}</em>
                </div>
              </article>
              <article className="is-brand">
                <span className="sms-stat-icon" aria-hidden>
                  <TowerIcon />
                </span>
                <div>
                  <span>Provider</span>
                  <strong>{provider?.label ?? "SMS.net.bd"}</strong>
                  <em>{site.domain}</em>
                </div>
              </article>
              <article className={gateway.senderId ? "is-success" : "is-amber"}>
                <span className="sms-stat-icon" aria-hidden>
                  <TagIcon />
                </span>
                <div>
                  <span>Sender ID</span>
                  <strong>{gateway.senderId || "Not set"}</strong>
                  <em>{onCount} templates on</em>
                </div>
              </article>
              <article className={gateway.hasApiKey ? "is-success" : "is-amber"}>
                <span className="sms-stat-icon" aria-hidden>
                  <KeyIcon />
                </span>
                <div>
                  <span>API key</span>
                  <strong>{gateway.hasApiKey ? "Saved" : "Missing"}</strong>
                  <em>{other.label} keeps a separate key</em>
                </div>
              </article>
            </div>
          </section>

          <section className="sms-card">
            <header className="sms-card-head">
              <span className="sms-stat-icon" aria-hidden>
                <TowerIcon />
              </span>
              <div>
                <h2>Gateway · {site.label}</h2>
                <p>{provider?.hint ?? "Choose a provider and save the API key from its panel."}</p>
              </div>
              <span className={`sms-pill ${gateway.status === "connected" ? "is-on" : ""}`}>{statusLabel(gateway.status)}</span>
            </header>
            <label className="gateway-check">
              <input
                type="checkbox"
                checked={gateway.enabled}
                onChange={(event) => patch({ enabled: event.target.checked })}
              />
              Enabled for {site.label}
            </label>
            <label className="field">
              Provider
              <select
                value={gateway.provider}
                onChange={(event) => patch({ provider: event.target.value as ProviderId })}
              >
                {gateway.providers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            {gateway.provider === "mimsms" ? (
              <label className="field">
                Username
                <input
                  value={gateway.username}
                  onChange={(event) => patch({ username: event.target.value })}
                  autoComplete="off"
                />
              </label>
            ) : null}
            {gateway.provider === "custom" || gateway.provider === "uniqbd" ? (
              <label className="field">
                API URL
                <input
                  value={gateway.baseUrl}
                  onChange={(event) => patch({ baseUrl: event.target.value })}
                  placeholder={gateway.provider === "uniqbd" ? "https://pay.uniqbd.com" : "https://api.example.com/sms"}
                  autoComplete="off"
                />
              </label>
            ) : null}
            {gateway.provider === "uniqbd" ? null : (
            <label className="field">
              Sender ID
              <input
                value={gateway.senderId}
                onChange={(event) => patch({ senderId: event.target.value })}
                placeholder={site.label}
                autoComplete="off"
              />
            </label>
            )}
            <label className="field">
              API key {gateway.hasApiKey ? "(saved — leave blank to keep)" : ""}
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={gateway.hasApiKey ? "••••••••" : "Paste the API key"}
                autoComplete="new-password"
              />
            </label>
            <div className="sms-actions">
              <button type="button" className="primary-btn" disabled={pending} onClick={() => void saveGateway()}>
                {pending ? "Working…" : `Save ${site.label}`}
              </button>
              <button type="button" className="sms-quiet" disabled={pending} onClick={() => void testConnection()}>
                Test connection
              </button>
            </div>
            <div className="sms-test">
              <label className="field">
                Test mobile number
                <input
                  value={testPhone}
                  onChange={(event) => setTestPhone(event.target.value)}
                  placeholder="01XXXXXXXXX"
                  inputMode="tel"
                />
              </label>
              <button
                type="button"
                className="sms-quiet"
                disabled={pending || testPhone.trim().length < 11}
                onClick={() => void sendTest()}
              >
                Send test SMS
              </button>
            </div>
          </section>

          <section className="sms-card">
            <header className="sms-card-head">
              <span className="sms-stat-icon" aria-hidden>
                <MessageIcon />
              </span>
              <div>
                <h2>Messages · {site.label}</h2>
                <p>
                  Placeholders: {"{name}"} {"{orderNumber}"} {"{amount}"} {"{code}"}. {other.label} keeps its own copy.
                </p>
              </div>
              <button type="button" className="sms-quiet" onClick={() => setDraft({ ...EMPTY_TEMPLATE })}>
                Add template
              </button>
            </header>
            <ul className="sms-templates">
              {gateway.templates.map((template) => (
                <li key={template.id}>
                  <div>
                    <strong>{template.name}</strong>
                    <span>{template.enabled ? "On" : "Off"}</span>
                    {template.isDefault ? <em>Default</em> : null}
                    <p>{template.body}</p>
                  </div>
                  <button type="button" className="sms-quiet" onClick={() => setDraft(template)}>
                    Edit
                  </button>
                </li>
              ))}
            </ul>
            {draft ? (
              <form
                className="sms-editor"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveTemplate();
                }}
              >
                <h3>{draft.id ? `Edit ${site.label} template` : `New ${site.label} template`}</h3>
                <label className="field">
                  Name
                  <input
                    value={draft.name}
                    onChange={(event) => setDraft((current) => (current ? { ...current, name: event.target.value } : current))}
                    required
                  />
                </label>
                <label className="field">
                  Message
                  <textarea
                    value={draft.body}
                    onChange={(event) => setDraft((current) => (current ? { ...current, body: event.target.value } : current))}
                    rows={4}
                    required
                  />
                </label>
                <label className="gateway-check">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, enabled: event.target.checked } : current))
                    }
                  />
                  Enabled
                </label>
                <div className="sms-actions">
                  <button type="submit" className="primary-btn" disabled={pending}>
                    {pending ? "Saving…" : "Save template"}
                  </button>
                  <button type="button" className="sms-quiet" onClick={() => setDraft(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}
          </section>
        </div>
      )}
    </AdminShell>
  );
}

function statusLabel(status: ShopGateway["status"]) {
  if (status === "connected") return "Ready";
  if (status === "setup") return "Setup";
  return "Off";
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" />
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

function SignalIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 19v-3M10 19v-6M15 19V9M20 19V5" />
    </svg>
  );
}

function TowerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21V10M8 21h8M9.5 10a2.5 2.5 0 0 1 5 0" />
      <path d="M7 7.5a6.5 6.5 0 0 1 10 0M4.5 5a10 10 0 0 1 15 0" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12V5h7l9 9-7 7-9-9Z" />
      <circle cx="8.5" cy="8.5" r="1" />
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

function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 6h14v9H8l-3 3V6Z" />
    </svg>
  );
}
