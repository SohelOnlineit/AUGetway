"use client";

import { useCallback, useEffect, useState } from "react";
import type { Permission } from "@amarpin/types";
import { adminFetch, can } from "@/lib/admin/api";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { formatBangladeshDateTime } from "@/lib/datetime";

type BlockType = "ip" | "country";

type AccessBlock = {
  id: string;
  type: BlockType;
  value: string;
  reason: string | null;
  createdAt: string;
};

const COUNTRIES = [
  { code: "AF", label: "Afghanistan" },
  { code: "AL", label: "Albania" },
  { code: "DZ", label: "Algeria" },
  { code: "AR", label: "Argentina" },
  { code: "AM", label: "Armenia" },
  { code: "AU", label: "Australia" },
  { code: "AT", label: "Austria" },
  { code: "AZ", label: "Azerbaijan" },
  { code: "BH", label: "Bahrain" },
  { code: "BD", label: "Bangladesh" },
  { code: "BY", label: "Belarus" },
  { code: "BE", label: "Belgium" },
  { code: "BT", label: "Bhutan" },
  { code: "BO", label: "Bolivia" },
  { code: "BA", label: "Bosnia and Herzegovina" },
  { code: "BR", label: "Brazil" },
  { code: "BN", label: "Brunei" },
  { code: "BG", label: "Bulgaria" },
  { code: "KH", label: "Cambodia" },
  { code: "CM", label: "Cameroon" },
  { code: "CA", label: "Canada" },
  { code: "CL", label: "Chile" },
  { code: "CN", label: "China" },
  { code: "CO", label: "Colombia" },
  { code: "CR", label: "Costa Rica" },
  { code: "HR", label: "Croatia" },
  { code: "CU", label: "Cuba" },
  { code: "CY", label: "Cyprus" },
  { code: "CZ", label: "Czechia" },
  { code: "DK", label: "Denmark" },
  { code: "EG", label: "Egypt" },
  { code: "EE", label: "Estonia" },
  { code: "ET", label: "Ethiopia" },
  { code: "FI", label: "Finland" },
  { code: "FR", label: "France" },
  { code: "GE", label: "Georgia" },
  { code: "DE", label: "Germany" },
  { code: "GH", label: "Ghana" },
  { code: "GR", label: "Greece" },
  { code: "HK", label: "Hong Kong" },
  { code: "HU", label: "Hungary" },
  { code: "IS", label: "Iceland" },
  { code: "IN", label: "India" },
  { code: "ID", label: "Indonesia" },
  { code: "IR", label: "Iran" },
  { code: "IQ", label: "Iraq" },
  { code: "IE", label: "Ireland" },
  { code: "IL", label: "Israel" },
  { code: "IT", label: "Italy" },
  { code: "JP", label: "Japan" },
  { code: "JO", label: "Jordan" },
  { code: "KZ", label: "Kazakhstan" },
  { code: "KE", label: "Kenya" },
  { code: "KW", label: "Kuwait" },
  { code: "LA", label: "Laos" },
  { code: "LV", label: "Latvia" },
  { code: "LB", label: "Lebanon" },
  { code: "LY", label: "Libya" },
  { code: "LT", label: "Lithuania" },
  { code: "LU", label: "Luxembourg" },
  { code: "MO", label: "Macao" },
  { code: "MY", label: "Malaysia" },
  { code: "MV", label: "Maldives" },
  { code: "MX", label: "Mexico" },
  { code: "MD", label: "Moldova" },
  { code: "MN", label: "Mongolia" },
  { code: "MA", label: "Morocco" },
  { code: "MM", label: "Myanmar" },
  { code: "NP", label: "Nepal" },
  { code: "NL", label: "Netherlands" },
  { code: "NZ", label: "New Zealand" },
  { code: "NG", label: "Nigeria" },
  { code: "KP", label: "North Korea" },
  { code: "NO", label: "Norway" },
  { code: "OM", label: "Oman" },
  { code: "PK", label: "Pakistan" },
  { code: "PS", label: "Palestine" },
  { code: "PA", label: "Panama" },
  { code: "PE", label: "Peru" },
  { code: "PH", label: "Philippines" },
  { code: "PL", label: "Poland" },
  { code: "PT", label: "Portugal" },
  { code: "QA", label: "Qatar" },
  { code: "RO", label: "Romania" },
  { code: "RU", label: "Russia" },
  { code: "SA", label: "Saudi Arabia" },
  { code: "RS", label: "Serbia" },
  { code: "SG", label: "Singapore" },
  { code: "SK", label: "Slovakia" },
  { code: "SI", label: "Slovenia" },
  { code: "ZA", label: "South Africa" },
  { code: "KR", label: "South Korea" },
  { code: "ES", label: "Spain" },
  { code: "LK", label: "Sri Lanka" },
  { code: "SE", label: "Sweden" },
  { code: "CH", label: "Switzerland" },
  { code: "SY", label: "Syria" },
  { code: "TW", label: "Taiwan" },
  { code: "TH", label: "Thailand" },
  { code: "TN", label: "Tunisia" },
  { code: "TR", label: "Turkey" },
  { code: "UA", label: "Ukraine" },
  { code: "AE", label: "United Arab Emirates" },
  { code: "GB", label: "United Kingdom" },
  { code: "US", label: "United States" },
  { code: "UZ", label: "Uzbekistan" },
  { code: "VE", label: "Venezuela" },
  { code: "VN", label: "Vietnam" },
  { code: "YE", label: "Yemen" },
].sort((a, b) => a.label.localeCompare(b.label));

export function AccessBlocksPanel({ permissions }: { permissions: Permission[] | undefined }) {
  const canEdit = can(permissions, "admin:users:write");
  const [rows, setRows] = useState<AccessBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ip, setIp] = useState("");
  const [country, setCountry] = useState("BD");
  const [reason, setReason] = useState("");
  const [filter, setFilter] = useState<"all" | BlockType>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await adminFetch<AccessBlock[]>("/security/access-blocks");
    setLoading(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setRows(Array.isArray(res.data) ? res.data : []);
    setError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(type: BlockType, value: string) {
    if (!canEdit) return;
    const trimmed = value.trim();
    if (!trimmed) {
      setError(type === "ip" ? "Enter an IP address." : "Choose a country.");
      return;
    }
    setSaving(true);
    setNotice(null);
    const res = await adminFetch<AccessBlock>("/security/access-blocks", {
      method: "POST",
      body: JSON.stringify({ type, value: trimmed, reason: reason.trim() || undefined }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError(null);
    setNotice(type === "ip" ? `${trimmed} is blocked.` : `${trimmed} is blocked.`);
    if (type === "ip") setIp("");
    setReason("");
    await load();
  }

  async function remove(row: AccessBlock) {
    if (!canEdit) return;
    setSaving(true);
    setNotice(null);
    const res = await adminFetch<{ ok: boolean }>(`/security/access-blocks/${row.id}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setRows((current) => current.filter((item) => item.id !== row.id));
    setError(null);
    setNotice(`${row.value} removed.`);
  }

  const visible = rows.filter((row) => filter === "all" || row.type === filter);
  const ipCount = rows.filter((row) => row.type === "ip").length;
  const countryCount = rows.filter((row) => row.type === "country").length;

  return (
    <section className="sec-ed-root">
      <header className="sec-ed-hero">
        <div className="sec-ed-hero-title">
          <span className="sec-ed-hero-icon" aria-hidden="true">
            <ShieldIcon />
          </span>
          <div>
            <h2>IP & country blocks</h2>
            <p>Blocked visitors get a 403 on the shop API. Admin pages stay open so you can undo a block.</p>
          </div>
        </div>
        <button type="button" className="catalog-ghost" onClick={() => void load()} disabled={loading || saving}>
          {loading ? "Loading…" : "Reload"}
        </button>
      </header>

      <dl className="catalog-stats sec-ed-stats">
        <div className="catalog-stat">
          <span className="catalog-stat-icon" aria-hidden="true">
            <ShieldIcon />
          </span>
          <div>
            <dt>Active</dt>
            <dd>{loading ? "…" : rows.length}</dd>
            <p>Rules in force</p>
          </div>
        </div>
        <div className="catalog-stat catalog-stat--amber">
          <span className="catalog-stat-icon" aria-hidden="true">
            <ShieldIcon />
          </span>
          <div>
            <dt>IP</dt>
            <dd>{loading ? "…" : ipCount}</dd>
            <p>Address blocks</p>
          </div>
        </div>
        <div className="catalog-stat catalog-stat--success">
          <span className="catalog-stat-icon" aria-hidden="true">
            <ShieldIcon />
          </span>
          <div>
            <dt>Country</dt>
            <dd>{loading ? "…" : countryCount}</dd>
            <p>ISO country blocks</p>
          </div>
        </div>
      </dl>

      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="catalog-notice">{notice}</p> : null}

      <article className="sec-ed-panel">
        <header className="sec-ed-panel-head">
          <div>
            <h3>Add a block</h3>
            <p>Use the visitor IP, or a 2-letter country code from Cloudflare (cf-ipcountry).</p>
          </div>
        </header>
        <p className="sec-ed-label">Reason (optional)</p>
        <div className="sec-ed-row">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Abuse, fraud, manual review" disabled={!canEdit || saving} />
        </div>
        <div className="sec-ab-grid">
          <div>
            <p className="sec-ed-label">IP address</p>
            <div className="sec-ed-row">
              <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="203.0.113.42" disabled={!canEdit || saving} />
              <button type="button" className="primary-btn" disabled={!canEdit || saving} onClick={() => void add("ip", ip)}>
                Block IP
              </button>
            </div>
          </div>
          <div>
            <p className="sec-ed-label">Country</p>
            <div className="sec-ed-row">
              <div className="sec-ab-country">
                <FilterMenu
                  label="Country"
                  value={country}
                  disabled={!canEdit || saving}
                  searchable
                  searchPlaceholder="Search country"
                  options={COUNTRIES.map((item) => ({ value: item.code, label: `${item.label} (${item.code})` }))}
                  onChange={setCountry}
                />
              </div>
              <button type="button" className="primary-btn" disabled={!canEdit || saving} onClick={() => void add("country", country)}>
                Block country
              </button>
            </div>
          </div>
        </div>
      </article>

      <article className="sec-ed-panel sec-ed-panel--block">
        <header className="sec-ed-panel-head">
          <div>
            <h3>Active blocks</h3>
            <p>{visible.length} shown</p>
          </div>
          <div className="sec-ab-filters" role="tablist" aria-label="Filter blocks">
            {(
              [
                ["all", "All"],
                ["ip", "IP"],
                ["country", "Country"],
              ] as const
            ).map(([value, label]) => (
              <button key={value} type="button" className={filter === value ? "is-on" : ""} onClick={() => setFilter(value)}>
                {label}
              </button>
            ))}
          </div>
        </header>
        {loading ? <p className="sec-ed-empty">Loading blocks…</p> : null}
        {!loading && visible.length === 0 ? <p className="sec-ed-empty">No active blocks.</p> : null}
        <div className="sec-ab-list">
          {visible.map((row) => (
            <article key={row.id} className="catalog-row">
              <div className="catalog-row-main">
                <span className={`sec-ed-tag${row.type === "country" ? " sec-ed-tag--block" : ""}`}>{row.type === "ip" ? "IP" : row.value}</span>
                <div>
                  <strong>{row.type === "ip" ? row.value : countryLabel(row.value)}</strong>
                  <p>
                    {row.reason || "No reason"} · {formatBangladeshDateTime(row.createdAt)}
                  </p>
                </div>
              </div>
              {canEdit ? (
                <button type="button" className="catalog-ghost" disabled={saving} onClick={() => void remove(row)}>
                  Remove
                </button>
              ) : null}
            </article>
          ))}
        </div>
      </article>

      {!canEdit ? <p className="sec-copy">You can view these blocks. Adding or removing them requires user-management permission.</p> : null}
    </section>
  );
}

function countryLabel(code: string) {
  return COUNTRIES.find((item) => item.code === code)?.label ?? code;
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.2 19 6v6.2c0 4.2-2.8 7.2-7 8.6-4.2-1.4-7-4.4-7-8.6V6l7-2.8Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}
