"use client";

import { useCallback, useEffect, useState } from "react";
import type { Permission } from "@amarpin/types";
import { adminFetch, can } from "@/lib/admin/api";

/** Suggested providers. Restored only when the admin clicks “Restore default providers”. */
const DEFAULT_ALLOW_DOMAINS = [
  "gmail.com",
  "outlook.com",
  "proton.me",
  "tuta.com",
  "zohomail.com",
  "gmx.com",
  "mail.com",
  "aol.com",
  "icloud.com",
  "mailfence.com",
  "mailo.com",
  "yandex.com",
] as const;

function orderDomains(domains: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of domains) {
    const d = raw.trim().toLowerCase();
    if (!d || seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  return out;
}

type DomainPayload = { allow: string[]; block: string[] };

function normalizeDomainLine(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith("@")) s = s.slice(1);
  if (s.startsWith("www.")) s = s.slice(4);
  s = s.replace(/\.$/, "");
  if (/[\s/@?#]/.test(s)) return null;
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(s)) return null;
  return s;
}

function parseBulk(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const d = normalizeDomainLine(line);
    if (d) out.push(d);
  }
  return out;
}

export function RegistrationEmailDomainsPanel({ permissions }: { permissions: Permission[] | undefined }) {
  const canEdit = can(permissions, "admin:users:write");
  const [allow, setAllow] = useState<string[]>([]);
  const [block, setBlock] = useState<string[]>([]);
  const [addAllow, setAddAllow] = useState("");
  const [addBlock, setAddBlock] = useState("");
  const [bulkAllow, setBulkAllow] = useState("");
  const [bulkBlock, setBulkBlock] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await adminFetch<DomainPayload>("/security/registration-email-domains");
    setLoading(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setAllow(orderDomains(Array.isArray(res.data.allow) ? res.data.allow : []));
    setBlock(orderDomains(Array.isArray(res.data.block) ? res.data.block : []));
    setError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(nextAllow: string[], nextBlock: string[]) {
    if (!canEdit) return;
    setSaving(true);
    setNotice(null);
    const allowPayload = orderDomains(nextAllow);
    const allowSet = new Set(allowPayload);
    const blockPayload = orderDomains(nextBlock).filter((d) => !allowSet.has(d));
    const res = await adminFetch<DomainPayload>("/security/registration-email-domains", {
      method: "PUT",
      body: JSON.stringify({ allow: allowPayload, block: blockPayload }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setAllow(orderDomains(Array.isArray(res.data.allow) ? res.data.allow : []));
    setBlock(orderDomains(Array.isArray(res.data.block) ? res.data.block : []));
    setError(null);
    setNotice("Saved.");
  }

  const allowMode = allow.length > 0;
  const headline = loading
    ? "Loading signup rules…"
    : allowMode
      ? "Only listed domains can register. Every chip can be removed."
      : block.length > 0
        ? "Open signup, except the blocked domains below."
        : "Open signup. Any email domain can register.";

  return (
    <section className="sec-ed-root">
      <header className="sec-ed-hero">
        <div className="sec-ed-hero-title">
          <span className="sec-ed-hero-icon" aria-hidden="true">
            <KeyRoundIcon />
          </span>
          <div>
            <h2>Registration email domains</h2>
            <p>{headline}</p>
          </div>
        </div>
        <div className="sec-ed-hero-actions">
          <button type="button" className="catalog-ghost" onClick={() => void load()} disabled={loading || saving}>
            {loading ? "Loading…" : "Reload"}
          </button>
          <button
            type="button"
            className="primary-btn"
            disabled={!canEdit || saving || loading}
            onClick={() => {
              void save(orderDomains([...DEFAULT_ALLOW_DOMAINS, ...allow]), block);
            }}
          >
            Restore defaults
          </button>
        </div>
      </header>

      <dl className="catalog-stats sec-ed-stats">
        <div className="catalog-stat catalog-stat--success">
          <span className="catalog-stat-icon" aria-hidden="true">
            <CheckMini />
          </span>
          <div>
            <dt>Allowed</dt>
            <dd>{loading ? "…" : allow.length}</dd>
            <p>{allowMode ? "Allowlist active" : "Allowlist off"}</p>
          </div>
        </div>
        <div className="catalog-stat catalog-stat--amber">
          <span className="catalog-stat-icon" aria-hidden="true">
            <BlockMini />
          </span>
          <div>
            <dt>Blocked</dt>
            <dd>{loading ? "…" : block.length}</dd>
            <p>Extra blocked domains</p>
          </div>
        </div>
        <div className="catalog-stat">
          <span className="catalog-stat-icon" aria-hidden="true">
            <KeyRoundIcon />
          </span>
          <div>
            <dt>Signup</dt>
            <dd>{loading ? "…" : allowMode ? "Restricted" : "Open"}</dd>
            <p>Public registration only</p>
          </div>
        </div>
      </dl>

      <p className="sec-ed-policy">
        With an allowlist, only those domains can be used for new self-service sign-ups. Click × on any domain, including Gmail or Outlook, to remove it. An empty allowlist means any domain can register unless it is listed under extra blocked domains. Customers created in the admin panel are not restricted by this list.
      </p>

      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="catalog-notice">{notice}</p> : null}

      <article className="sec-ed-panel">
        <header className="sec-ed-panel-head">
          <div>
            <h3>Allowed domains</h3>
            <p>Exact hostname, for example yahoo.co.uk. Missing domains are blocked while this list has entries.</p>
          </div>
        </header>

        <div className="sec-ed-tags" aria-label="Allowed domains">
          {!loading && allow.length === 0 ? <span className="sec-ed-empty">No domains in the allowlist.</span> : null}
          {allow.map((d) => (
            <span key={d} className="sec-ed-tag">
              {d}
              {canEdit ? (
                <button type="button" aria-label={`Remove ${d}`} onClick={() => void save(allow.filter((x) => x !== d), block)}>
                  ×
                </button>
              ) : null}
            </span>
          ))}
        </div>

        <p className="sec-ed-label">Add domain</p>
        <div className="sec-ed-row">
          <input
            value={addAllow}
            onChange={(e) => setAddAllow(e.target.value)}
            placeholder="gmail.com"
            disabled={!canEdit || saving}
          />
          <button
            type="button"
            className="primary-btn"
            disabled={!canEdit || saving}
            onClick={() => {
              const d = normalizeDomainLine(addAllow);
              if (!d) {
                setError("Enter a valid domain (e.g. gmail.com).");
                return;
              }
              if (allow.includes(d)) {
                setAddAllow("");
                return;
              }
              void save(orderDomains([...allow, d]), block);
              setAddAllow("");
            }}
          >
            Add
          </button>
        </div>

        <p className="sec-ed-label">Bulk paste, one per line</p>
        <textarea
          className="sec-ed-textarea"
          value={bulkAllow}
          onChange={(e) => setBulkAllow(e.target.value)}
          placeholder={"gmail.com\nyahoo.com\noutlook.com"}
          disabled={!canEdit || saving}
          rows={4}
        />
        <button
          type="button"
          className="catalog-ghost sec-ed-merge"
          disabled={!canEdit || saving}
          onClick={() => {
            const parsed = parseBulk(bulkAllow);
            if (parsed.length === 0) return;
            void save(orderDomains([...allow, ...parsed]), block);
            setBulkAllow("");
          }}
        >
          Merge pasted domains
        </button>
      </article>

      <article className="sec-ed-panel sec-ed-panel--block">
        <header className="sec-ed-panel-head">
          <div>
            <h3>Extra blocked domains</h3>
            <p>Used when the allowlist is empty. While an allowlist is active, anything not on it is already blocked.</p>
          </div>
        </header>

        <div className="sec-ed-tags" aria-label="Blocked domains">
          {!loading && block.length === 0 ? <span className="sec-ed-empty">No blocked domains yet.</span> : null}
          {block.map((d) => (
            <span key={d} className="sec-ed-tag sec-ed-tag--block">
              {d}
              {canEdit ? (
                <button type="button" aria-label={`Remove ${d}`} onClick={() => void save(allow, block.filter((x) => x !== d))}>
                  ×
                </button>
              ) : null}
            </span>
          ))}
        </div>

        <p className="sec-ed-label">Add domain</p>
        <div className="sec-ed-row">
          <input
            value={addBlock}
            onChange={(e) => setAddBlock(e.target.value)}
            placeholder="tempmail.com"
            disabled={!canEdit || saving}
          />
          <button
            type="button"
            className="primary-btn"
            disabled={!canEdit || saving}
            onClick={() => {
              const d = normalizeDomainLine(addBlock);
              if (!d) {
                setError("Enter a valid domain.");
                return;
              }
              if (block.includes(d)) {
                setAddBlock("");
                return;
              }
              void save(allow, orderDomains([...block, d]));
              setAddBlock("");
            }}
          >
            Add
          </button>
        </div>

        <p className="sec-ed-label">Bulk paste, one per line</p>
        <textarea
          className="sec-ed-textarea"
          value={bulkBlock}
          onChange={(e) => setBulkBlock(e.target.value)}
          placeholder={"tempmail.com\ndisposable.example"}
          disabled={!canEdit || saving}
          rows={3}
        />
        <button
          type="button"
          className="catalog-ghost sec-ed-merge"
          disabled={!canEdit || saving}
          onClick={() => {
            const parsed = parseBulk(bulkBlock);
            if (parsed.length === 0) return;
            void save(allow, orderDomains([...block, ...parsed]));
            setBulkBlock("");
          }}
        >
          Merge pasted domains
        </button>
      </article>

      {!canEdit ? <p className="sec-copy">You can view these settings. Saving requires user-management permission.</p> : null}
    </section>
  );
}

function KeyRoundIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="8" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M11 12h9M15 12v2M18 12v2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CheckMini() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12.5 9.2 17 19 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BlockMini() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="m7 17 10-10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
