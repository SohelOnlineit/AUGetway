"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { EmailSectionNav } from "@/components/admin/EmailSectionNav";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch } from "@/lib/admin/api";

type Category = "orders" | "account" | "system";
type Recipient = "customer" | "admin";

type Template = {
  id: string;
  category: Category;
  recipient: Recipient;
  label: string;
  description: string;
  subject: string;
  enabled: boolean;
  wired: boolean;
  hint: string | null;
};

type ShopId = "amarpin" | "uniqbd";

const SHOPS: Array<{ id: ShopId; label: string; domain: string }> = [
  { id: "amarpin", label: "AuGetway", domain: "amarpin.com" },
  { id: "uniqbd", label: "UniQbd", domain: "uniqbd.com" },
];

type Settings = {
  shops: Record<ShopId, { customerOrderEmails: boolean; adminOrderAlerts: boolean }>;
};

const CATEGORIES: Array<{ id: Category; title: string; description: string }> = [
  { id: "orders", title: "Orders", description: "Lifecycle emails for purchases, delivery, refunds, and admin alerts." },
  { id: "account", title: "Account", description: "Welcome, verification, and password recovery messages." },
  { id: "system", title: "System", description: "Operational diagnostics and infrastructure notifications." },
];

export default function EmailTemplatesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shop: ShopId = searchParams.get("shop") === "uniqbd" ? "uniqbd" : "amarpin";
  const site = SHOPS.find((item) => item.id === shop)!;
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [status, setStatus] = useState<"all" | "enabled" | "disabled">("all");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    setReady(false);
    const [library, mail] = await Promise.all([
      adminFetch<{ templates: Template[] }>(`/email/templates?shop=${shop}`),
      adminFetch<Settings>("/email/settings"),
    ]);
    if (!library.ok) {
      setError(library.message);
      setReady(true);
      return;
    }
    setTemplates(library.data.templates);
    if (mail.ok) setSettings(mail.data);
    setError(null);
    setReady(true);
  }, [shop]);

  useEffect(() => {
    if (loading || sessionError) return;
    void load();
  }, [load, loading, sessionError]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (status === "enabled" && !item.enabled) return false;
      if (status === "disabled" && item.enabled) return false;
      if (!q) return true;
      return [item.label, item.description, item.subject, item.id].some((value) => value.toLowerCase().includes(q));
    });
  }, [templates, query, category, status]);

  const enabled = templates.filter((item) => item.enabled).length;
  const orders = filtered.filter((item) => item.category === "orders").length;
  const account = filtered.filter((item) => item.category === "account").length;
  const system = filtered.filter((item) => item.category === "system").length;

  async function toggle(item: Template) {
    const next = !item.enabled;
    setTemplates((current) => current.map((row) => (row.id === item.id ? { ...row, enabled: next } : row)));
    setNotice(null);
    const result = await adminFetch<Template>(`/email/templates/${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ shop, enabled: next }),
    });
    if (!result.ok) {
      setError(result.message);
      await load();
      return;
    }
    setTemplates((current) => current.map((row) => (row.id === item.id ? { ...row, ...result.data } : row)));
    setNotice(`${site.label}: ${item.label} ${next ? "enabled" : "disabled"}.`);
  }

  return (
    <AdminShell
      title="Email Template Customize and Design"
      lead="Each shop keeps its own subjects, wording, and on/off switches"
      permissions={permissions}
    >
      {sessionError || error ? <p className="form-error">{sessionError || error}</p> : null}
      {!ready ? (
        <p className="mail-loading">{sessionError ? "" : "Loading templates…"}</p>
      ) : (
        <div className="tpl-page">
          <div className="mail-shops" role="tablist" aria-label="Site">
            {SHOPS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={item.id === shop}
                className={item.id === shop ? "is-on" : ""}
                onClick={() => router.replace(`/admin/settings/email/templates?shop=${item.id}`)}
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
          <section className="tpl-card">
            <header className="tpl-card-head">
              <div>
                <h2>Template library · {site.label}</h2>
                <p>{templates.length} templates. Saving here does not change {shop === "uniqbd" ? "AuGetway" : "UniQbd"}.</p>
              </div>
            </header>
            <div className="tpl-stats">
              <article>
                <span>Total</span>
                <strong>{templates.length}</strong>
                <em>All templates</em>
              </article>
              <article className="is-ok">
                <span>Enabled</span>
                <strong>{enabled}</strong>
                <em>Enabled in library</em>
              </article>
              <article className={templates.length - enabled > 0 ? "is-warn" : ""}>
                <span>Disabled</span>
                <strong>{templates.length - enabled}</strong>
                <em>Skipped at send time</em>
              </article>
              <article>
                <span>Categories</span>
                <strong>3</strong>
                <em>Orders · Account · System</em>
              </article>
            </div>
            {settings && (!settings.shops[shop].customerOrderEmails || !settings.shops[shop].adminOrderAlerts) ? (
              <p className="tpl-warn">
                {!settings.shops[shop].customerOrderEmails ? `${site.label} customer order emails are off in SMTP settings, so customer order templates are skipped. ` : ""}
                {!settings.shops[shop].adminOrderAlerts ? `${site.label} admin order alerts are off, so the New Order template will not send.` : ""}
              </p>
            ) : null}
            <div className="tpl-view">
              <span><b>In view</b> {filtered.length}</span>
              <span><b>Orders</b> {orders}</span>
              <span><b>Account</b> {account}</span>
              <span><b>System</b> {system}</span>
              <button type="button" onClick={() => void load()}>Refresh</button>
            </div>
            <EmailSectionNav />
            <div className="tpl-filters">
              <label>
                <span>Search</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Template name, subject, or ID…" />
              </label>
              <label>
                <span>Category</span>
                <select value={category} onChange={(event) => setCategory(event.target.value as Category | "all")}>
                  <option value="all">All categories</option>
                  {CATEGORIES.map((item) => (
                    <option key={item.id} value={item.id}>{item.title}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Status</span>
                <select value={status} onChange={(event) => setStatus(event.target.value as "all" | "enabled" | "disabled")}>
                  <option value="all">Any status</option>
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
            </div>
          </section>

          {filtered.length === 0 ? (
            <section className="tpl-card">
              <h2>No templates found</h2>
              <p>Try a different search term or filter.</p>
            </section>
          ) : (
            CATEGORIES.map((group) => {
              const rows = filtered.filter((item) => item.category === group.id);
              if (rows.length === 0) return null;
              return (
                <section key={group.id} className="tpl-card">
                  <header className="tpl-card-head">
                    <div>
                      <h2>{group.title}</h2>
                      <p>{rows.length} template{rows.length === 1 ? "" : "s"} · {group.description}</p>
                    </div>
                  </header>
                  <div className="tpl-table-wrap">
                    <table className="tpl-table">
                      <thead>
                        <tr>
                          <th>Template</th>
                          <th>Recipient</th>
                          <th>Subject</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <div className="tpl-name">
                                <strong>{item.label}</strong>
                                {!item.wired ? <em className="tpl-badge">Not wired</em> : null}
                                {item.wired && item.hint ? <em className="tpl-badge is-note">Note</em> : null}
                              </div>
                              <p>{item.description}</p>
                              {item.hint ? <p className="tpl-hint">{item.hint}</p> : null}
                              <code>{item.id}</code>
                            </td>
                            <td>
                              <span className={`tpl-recipient is-${item.recipient}`}>{item.recipient}</span>
                            </td>
                            <td>
                              <span className="tpl-subject" title={item.subject}>{item.subject}</span>
                            </td>
                            <td>
                              <span className={`tpl-status${item.enabled ? " is-on" : ""}`}>{item.enabled ? "Enabled" : "Disabled"}</span>
                              <button
                                type="button"
                                className="tpl-switch"
                                role="switch"
                                aria-checked={item.enabled}
                                aria-label={`${item.enabled ? "Disable" : "Enable"} ${item.label}`}
                                onClick={() => void toggle(item)}
                              />
                            </td>
                            <td>
                              <Link href={`/admin/settings/email/templates/${encodeURIComponent(item.id)}?shop=${shop}`}>Customize →</Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })
          )}
          {notice ? <p className="mail-notice">{notice}</p> : null}
        </div>
      )}
    </AdminShell>
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
