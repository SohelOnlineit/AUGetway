"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch } from "@/lib/admin/api";
import { formatBangladeshDateTime } from "@/lib/datetime";
import { AccessBlocksPanel } from "./AccessBlocksPanel";
import { RegistrationEmailDomainsPanel } from "./RegistrationEmailDomainsPanel";

type SectionId =
  | "overview"
  | "rate-limit"
  | "recaptcha"
  | "email-domains"
  | "cloudflare"
  | "helmet"
  | "blocks"
  | "audit"
  | "activity";

type Overview = {
  rateLimit: {
    enabled: true;
    limit: number;
    ttlMs: number;
    storage: "memory";
    redisReachable: boolean;
    routes: Array<{ label: string; limit: number; windowSec: number }>;
  };
  recaptcha: { configured: boolean; enabled: boolean };
  cloudflare: { enabled: boolean; trustProxyHops: number };
  helmet: { enabled: boolean; protections: string[] };
  audit: { enabled: boolean; total: number; last24h: number };
  activity: { last24h: number; sampleRate: number };
  accessBlocks: { total: number; ip: number; country: number };
  plaintextCodes: { documents: number; inventory: number; orders: number; reseller: number };
  recommendation: string;
  recentAudit: Array<{ id: string; action: string; actor: string; createdAt: string }>;
  recentActivity: Array<{ id: string; name: string; path: string; createdAt: string }>;
};

const SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "rate-limit", label: "Rate limiting" },
  { id: "recaptcha", label: "reCAPTCHA" },
  { id: "email-domains", label: "Email domains" },
  { id: "cloudflare", label: "Cloudflare" },
  { id: "helmet", label: "Helmet" },
  { id: "blocks", label: "IP & country blocks" },
  { id: "audit", label: "Audit logs" },
  { id: "activity", label: "Activity" },
];

function count(value: number) {
  return value.toLocaleString("en-US");
}

export default function AdminSecurityPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [section, setSection] = useState<SectionId>("overview");

  const load = useCallback(async () => {
    setPending(true);
    const result = await adminFetch<Overview>("/security/overview");
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setOverview(result.data);
    setError(null);
  }, []);

  useEffect(() => {
    if (loading || sessionError) return;
    void load();
  }, [load, loading, sessionError]);

  const windowSec = overview ? Math.round(overview.rateLimit.ttlMs / 1000) : 60;
  const samplePct = overview ? Math.round(overview.activity.sampleRate * 100) : 100;

  return (
    <AdminShell
      title="Security"
      lead="Rate limiting, IP/country blocks, Helmet, reCAPTCHA, Cloudflare, audit and activity logging."
      permissions={permissions}
    >
      {sessionError || error ? <p className="form-error">{sessionError || error}</p> : null}
      <div className="sec-page">
        <section className="sec-card">
          <header className="sec-card-head">
            <span className="sec-card-icon" aria-hidden="true">
              <ShieldIcon />
            </span>
            <div className="sec-card-copy">
              <strong>Security overview</strong>
              <p>
                {overview
                  ? `${count(overview.audit.last24h)} audit events · ${count(overview.activity.last24h)} activity events (24h)`
                  : "Loading security settings…"}
              </p>
            </div>
            <button type="button" className="catalog-ghost" onClick={() => void load()} disabled={pending || loading}>
              {pending ? "Refreshing…" : "Refresh"}
            </button>
          </header>

          <div className="sec-stats">
            <Stat
              tone="success"
              label="Rate limit"
              value={overview ? (overview.rateLimit.enabled ? "On" : "Off") : "…"}
              meta={overview ? `${overview.rateLimit.limit} req / ${windowSec}s` : "…"}
              icon={<CheckIcon />}
            />
            <Stat
              tone={overview?.recaptcha.configured ? "success" : "amber"}
              label="reCAPTCHA"
              value={overview ? (overview.recaptcha.configured ? "Live" : "Off") : "…"}
              meta={overview ? (overview.recaptcha.enabled ? "Auth protected" : "Not configured") : "…"}
              icon={<KeyIcon />}
            />
            <Stat
              tone="brand"
              label="Audit (24h)"
              value={overview ? count(overview.audit.last24h) : "…"}
              meta={overview ? `${count(overview.audit.total)} total` : "…"}
              icon={<CheckIcon />}
            />
            <Stat
              tone="brand"
              label="Activity (24h)"
              value={overview ? count(overview.activity.last24h) : "…"}
              meta={overview ? `${samplePct}% sampled` : "…"}
              icon={<PulseIcon />}
              wide
            />
            <Stat
              tone={(overview?.accessBlocks.total ?? 0) > 0 ? "amber" : "success"}
              label="Access blocks"
              value={overview ? String(overview.accessBlocks.total) : "…"}
              meta={
                overview
                  ? `${overview.accessBlocks.ip} IP · ${overview.accessBlocks.country} country`
                  : "…"
              }
              icon={<ShieldIcon />}
            />
          </div>

          <ul className="sec-status" aria-label="Protection status">
            <li>
              <span className={`sec-status-dot${overview ? " is-on" : ""}`} />
              <div>
                <span>Storage</span>
                <strong>{overview ? "Memory" : "…"}</strong>
              </div>
            </li>
            <li>
              <span className={`sec-status-dot${overview?.cloudflare.enabled ? " is-on" : overview ? " is-off" : ""}`} />
              <div>
                <span>Cloudflare</span>
                <strong>{overview ? (overview.cloudflare.enabled ? "On" : "Off") : "…"}</strong>
              </div>
            </li>
            <li>
              <span className={`sec-status-dot${overview?.helmet.enabled ? " is-on" : overview ? " is-off" : ""}`} />
              <div>
                <span>Helmet</span>
                <strong>{overview ? (overview.helmet.enabled ? "Headers on" : "Off") : "…"}</strong>
              </div>
            </li>
            <li>
              <span
                className={`sec-status-dot${
                  overview ? ((overview.accessBlocks.total ?? 0) > 0 ? " is-warn" : " is-on") : ""
                }`}
              />
              <div>
                <span>Blocks</span>
                <strong>
                  {overview
                    ? `${overview.accessBlocks.ip} IP · ${overview.accessBlocks.country} country`
                    : "…"}
                </strong>
              </div>
            </li>
          </ul>

          <p className="sec-kicker">Sections</p>
          <div className="sec-tabs" role="tablist">
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={section === item.id}
                className={section === item.id ? "is-on" : ""}
                onClick={() => setSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        {section === "overview" ? (
          <section className="sec-card">
            <header className="sec-card-head">
              <span className="sec-card-icon" aria-hidden="true">
                <ShieldIcon />
              </span>
              <div>
                <strong>Platform protection</strong>
                <p>Protection and logging at a glance</p>
              </div>
            </header>
            <p className="sec-copy">
              Rate limits run per IP on this API. Gift-card codes are stored encrypted, never as plaintext.
            </p>
            <p className="sec-note">{overview?.recommendation ?? "Loading protection status…"}</p>
            <div className="sec-info-grid">
              <Info
                label="Global rate limit"
                value={overview ? `${overview.rateLimit.limit} req / ${windowSec}s per IP` : "…"}
                hint={overview ? `Storage: ${overview.rateLimit.storage}` : "…"}
              />
              <Info
                label="Activity sampling"
                value={overview ? `${samplePct}% of storefront events` : "…"}
                hint="Recorded storefront events from the last 24 hours"
              />
              <Info
                label="Audit logging"
                value={
                  overview
                    ? `${overview.audit.enabled ? "Enabled" : "Disabled"} · ${count(overview.audit.total)} total`
                    : "…"
                }
                hint={overview ? `${count(overview.audit.last24h)} events in last 24h` : "…"}
              />
              <Info
                label="Legacy plaintext codes"
                value={overview ? `${count(overview.plaintextCodes.documents)} documents` : "…"}
                hint={
                  overview
                    ? `Inventory ${count(overview.plaintextCodes.inventory)} · Orders ${count(overview.plaintextCodes.orders)} · Reseller ${count(overview.plaintextCodes.reseller)}`
                    : "…"
                }
              />
              <Info
                label="Helmet protections"
                value={overview ? (overview.helmet.enabled ? "Active" : "Off") : "…"}
                hint={overview?.helmet.protections.slice(0, 3).join(" · ") ?? "…"}
              />
            </div>
          </section>
        ) : null}

        {section === "rate-limit" && overview ? (
          <Panel title="Rate limiting" text="Global request throttling per IP. These limits are enforced by the API.">
            <div className="sec-info-grid">
              {overview.rateLimit.routes.map((route) => (
                <Info
                  key={route.label}
                  label={route.label}
                  value={`${route.limit} req / ${route.windowSec}s`}
                  hint={`Storage: ${overview.rateLimit.storage}`}
                />
              ))}
            </div>
          </Panel>
        ) : null}

        {section === "recaptcha" ? (
          <Panel title="reCAPTCHA" text="Bot protection on auth endpoints.">
            <p className="sec-copy">reCAPTCHA is not configured. Login and register stay protected by the per-IP rate limits.</p>
          </Panel>
        ) : null}

        {section === "email-domains" ? (
          <RegistrationEmailDomainsPanel permissions={permissions} />
        ) : null}

        {section === "cloudflare" && overview ? (
          <Panel title="Cloudflare" text="Client IP resolution behind a proxy.">
            <p className="sec-copy">
              Cloudflare IP resolution is off. The API trusts {overview.cloudflare.trustProxyHops} proxy hop and reads the forwarded client address.
            </p>
          </Panel>
        ) : null}

        {section === "helmet" && overview ? (
          <Panel title="Helmet" text="Browser security headers on every API response.">
            <p className="sec-copy">{overview.helmet.enabled ? "Headers on." : "Headers off."}</p>
            <ul className="sec-list">
              {overview.helmet.protections.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Panel>
        ) : null}

        {section === "blocks" ? <AccessBlocksPanel permissions={permissions} /> : null}

        {section === "audit" && overview ? (
          <Panel title="Audit logs" text="Staff actions recorded by the API.">
            <LogList
              empty="No audit events yet."
              rows={overview.recentAudit.map((row) => ({
                id: row.id,
                title: row.action,
                meta: `${row.actor} · ${formatBangladeshDateTime(row.createdAt)}`,
                href: `/admin/audit/${row.id}`,
              }))}
            />
            <Link href="/admin/audit" className="sec-more">
              Open full audit log
            </Link>
          </Panel>
        ) : null}

        {section === "activity" && overview ? (
          <Panel title="Activity" text="Storefront events from the last samples.">
            <LogList
              empty="No activity events yet."
              rows={overview.recentActivity.map((row) => ({
                id: row.id,
                title: row.name,
                meta: `${row.path} · ${formatBangladeshDateTime(row.createdAt)}`,
              }))}
            />
          </Panel>
        ) : null}
      </div>
    </AdminShell>
  );
}

function Panel({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <section className="sec-card">
      <header className="sec-card-head">
        <span className="sec-card-icon" aria-hidden="true">
          <ShieldIcon />
        </span>
        <div>
          <strong>{title}</strong>
          <p>{text}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function Stat({
  tone,
  label,
  value,
  meta,
  icon,
  wide,
}: {
  tone: "success" | "amber" | "brand";
  label: string;
  value: string;
  meta: string;
  icon: ReactNode;
  wide?: boolean;
}) {
  return (
    <article className={`sec-stat sec-stat--${tone}${wide ? " is-wide" : ""}`}>
      <span aria-hidden="true">{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{meta}</small>
      </div>
    </article>
  );
}

function Info({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article className="sec-info">
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function LogList({
  rows,
  empty,
}: {
  rows: Array<{ id: string; title: string; meta: string; href?: string }>;
  empty: string;
}) {
  if (rows.length === 0) return <p className="sec-copy">{empty}</p>;
  return (
    <ul className="sec-log">
      {rows.map((row) => (
        <li key={row.id}>
          {row.href ? <Link href={row.href}>{row.title}</Link> : <strong>{row.title}</strong>}
          <span>{row.meta}</span>
        </li>
      ))}
    </ul>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l7 3v6c0 4.2-2.8 7.4-7 9-4.2-1.6-7-4.8-7-9V6l7-3z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 12.5l4 4L18 8" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="8" cy="12" r="3.2" />
      <path d="M11 12h9M17 12v3M20 12v2" />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12h4l2.2-5 3.6 10L15 12h6" />
    </svg>
  );
}
