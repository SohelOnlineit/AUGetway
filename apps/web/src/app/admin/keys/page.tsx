"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type KeyRow = {
  id: string;
  label: string;
  prefix: string;
  keyType: string;
  abilities: string[];
  webhookUrl: string;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
};
type Col = "name" | "type" | "key" | "abilities" | "expires" | "active";
type SortKey = "name" | "expires";

const columns: { key: Col; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "type", label: "Type" },
  { key: "key", label: "API Key / Public Key" },
  { key: "abilities", label: "Abilities" },
  { key: "expires", label: "Expires at" },
  { key: "active", label: "Active" },
];

function typeLabel(keyType: string) {
  return keyType === "sms" ? "SMS Gateway" : "Payment Gateway";
}

function readSeen() {
  try {
    const raw = sessionStorage.getItem("uniqpay_seen_keys");
    const parsed = raw ? JSON.parse(raw) as Record<string, string> : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function expiryLabel(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function KeysPage() {
  const [rows, setRows] = useState<KeyRow[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [shown, setShown] = useState<Record<Col, boolean>>({
    name: true,
    type: true,
    key: true,
    abilities: true,
    expires: true,
    active: true,
  });
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [seen, setSeen] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<{ id: string; ok: boolean } | null>(null);
  const [removing, setRemoving] = useState<KeyRow | null>(null);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const stored = readSeen();
    const issued = sessionStorage.getItem("uniqpay_fresh_key");
    if (issued) {
      try {
        const parsed = JSON.parse(issued) as { id: string; token: string };
        if (parsed.id && parsed.token) stored[parsed.id] = parsed.token;
      } catch {
        /* keep the keys already stored in this tab */
      }
      sessionStorage.removeItem("uniqpay_fresh_key");
      sessionStorage.setItem("uniqpay_seen_keys", JSON.stringify(stored));
    }
    setSeen(stored);
    api<KeyRow[]>("/desk/keys")
      .then((list) => {
        setRows(list);
        setReady(true);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load"));
  }, []);

  const visible = columns.filter((column) => shown[column.key]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (!needle) return true;
      const abilities = Array.isArray(row.abilities) ? row.abilities.join(" ") : "";
      return [row.label, row.prefix, abilities, row.keyType].some((value) => value.toLowerCase().includes(needle));
    });
    const factor = dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sort === "name") return a.label.localeCompare(b.label) * factor;
      const left = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY;
      const right = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY;
      return (left - right) * factor;
    });
  }, [rows, query, sort, dir]);

  function toggleSort(key: SortKey) {
    if (sort === key) setDir((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir("asc");
    }
  }

  async function toggleActive(row: KeyRow) {
    const next = !row.active;
    setRows((current) => current.map((item) => (item.id === row.id ? { ...item, active: next } : item)));
    try {
      await api(`/desk/keys/${row.id}`, { method: "PATCH", body: JSON.stringify({ active: next }) });
    } catch (cause) {
      setRows((current) => current.map((item) => (item.id === row.id ? { ...item, active: row.active } : item)));
      setError(cause instanceof Error ? cause.message : "Could not update");
    }
  }

  async function copyKey(id: string, value: string) {
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      ok = false;
    }
    setCopied({ id, ok });
    window.setTimeout(() => setCopied((current) => (current?.id === id ? null : current)), 2000);
  }

  async function removeKey() {
    if (!removing || busy) return;
    setBusy(true);
    setFormError("");
    try {
      await api(`/desk/keys/${removing.id}`, { method: "DELETE" });
      setRows((current) => current.filter((row) => row.id !== removing.id));
      setRemoving(null);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  }

  const activeCount = rows.filter((row) => row.active).length;
  const paymentCount = rows.filter((row) => row.keyType !== "sms").length;

  return (
    <div className="ogw-page">
      {error ? <p className="error">{error}</p> : null}
      <header className="ogw-head">
        <div>
          <p className="ogw-kicker">Developers</p>
          <h2>Api Keys</h2>
          <p>Checkout keys for the shop. A new secret is shown once, in this browser tab.</p>
        </div>
        <Link className="mgw-new" href="/admin/api-keys/create">New API key</Link>
      </header>
      <div className="ogw-stats">
        <article><b>{ready ? rows.length : "—"}</b><small>Keys</small></article>
        <article><b>{ready ? activeCount : "—"}</b><small>Active</small></article>
        <article><b>{ready ? paymentCount : "—"}</b><small>Payment</small></article>
        <article><b>{ready ? rows.length - paymentCount : "—"}</b><small>SMS</small></article>
      </div>
      <section className="ogw-card">
        <div className="ogw-tools">
          <label className="ogw-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input value={query} placeholder="Search keys" aria-label="Search keys" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="keys-cols-wrap">
            <button className="keys-cols" type="button" aria-label="Columns" onClick={() => setColumnsOpen((open) => !open)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="5" width="3.2" height="14" rx="1" />
                <rect x="10.4" y="5" width="3.2" height="14" rx="1" />
                <rect x="16.8" y="5" width="3.2" height="14" rx="1" />
              </svg>
            </button>
            {columnsOpen ? (
              <div className="keys-menu">
                {columns.map((column) => (
                  <label
                    key={column.key}
                    onClick={(event) => {
                      event.preventDefault();
                      setShown((current) => ({ ...current, [column.key]: !current[column.key] }));
                    }}
                  >
                    <input type="checkbox" checked={shown[column.key]} readOnly />
                    {column.label}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="ogw-scroll">
        <table className="ogw-table keys-table">
          <thead>
            <tr>
              {visible.map((column) => (
                <th key={column.key}>
                  {column.key === "name" || column.key === "expires" ? (
                    <button type="button" onClick={() => toggleSort(column.key as SortKey)}>
                      {column.label}
                      <Caret on={sort === column.key} dir={dir} />
                    </button>
                  ) : column.label}
                </th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
                const secret = seen[row.id] ?? `${row.prefix}…`;
                const abilities = Array.isArray(row.abilities) ? row.abilities : [];
                return (
                  <tr key={row.id}>
                    {shown.name ? (
                      <td>
                        <div className="ogw-name">
                          <span className="ogw-mark" aria-hidden>{(row.label || "K").slice(0, 1)}</span>
                          <strong>{row.label}</strong>
                        </div>
                      </td>
                    ) : null}
                    {shown.type ? (
                      <td>
                        <span className={row.keyType === "sms" ? "ogw-pill" : "ogw-pill ogw-pill--live"}>{typeLabel(row.keyType)}</span>
                      </td>
                    ) : null}
                    {shown.key ? (
                      <td>
                        <div className="key-line">
                          <span className="key-secret">{secret}</span>
                          <button
                            className={copied?.id === row.id ? (copied.ok ? "key-copy done" : "key-copy fail") : "key-copy"}
                            type="button"
                            aria-label={copied?.id === row.id ? (copied.ok ? "Copied" : "Could not copy") : "Copy API key"}
                            onClick={() => copyKey(row.id, secret)}
                          >
                            {copied?.id === row.id && copied.ok ? (
                              <>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                                  <path d="M20 6 9 17l-5-5" />
                                </svg>
                                <span>Copied</span>
                              </>
                            ) : copied?.id === row.id ? (
                              <span>Failed</span>
                            ) : (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="9" y="9" width="11" height="11" rx="2" />
                                <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </td>
                    ) : null}
                    {shown.abilities ? (
                      <td className="key-abilities">{abilities.map((ability) => <span key={ability}>{ability}</span>)}</td>
                    ) : null}
                    {shown.expires ? <td className="ogw-account">{expiryLabel(row.expiresAt)}</td> : null}
                    {shown.active ? (
                      <td>
                        <button className={`switch ${row.active ? "on" : ""}`} type="button" aria-label={row.active ? "Turn off" : "Turn on"} onClick={() => toggleActive(row)}>
                          <span />
                        </button>
                      </td>
                    ) : null}
                    <td>
                      <div className="key-row-actions">
                        <Link className="ogw-edit" href={`/admin/api-keys/${row.id}/edit`}>Edit</Link>
                        <button type="button" className="key-remove" onClick={() => { setFormError(""); setRemoving(row); }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
            })}
            {ready && filtered.length === 0 ? <tr><td colSpan={visible.length + 1}>No API keys match.</td></tr> : null}
          </tbody>
        </table>
        </div>
        <div className="ogw-foot">
          <span>{ready ? `Showing ${filtered.length} of ${rows.length}` : "Loading keys"}</span>
        </div>
      </section>
      {removing ? (
        <div className="modal-back" onClick={() => { if (!busy) setRemoving(null); }}>
          <form className="modal dev-modal ogw-modal" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void removeKey(); }}>
            <header className="dev-modal-head">
              <div>
                <p className="keys-crumb">Api Keys <span>›</span> Delete</p>
                <h2>Delete API key</h2>
              </div>
              <button className="dev-close" type="button" onClick={() => setRemoving(null)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18" /></svg>
                Close
              </button>
            </header>
            <div className="dev-modal-body">
              <p>Delete <strong>{removing.label}</strong>? A store using this key will no longer be able to create or verify checkouts.</p>
              {formError ? <p className="error">{formError}</p> : null}
            </div>
            <div className="dev-modal-actions">
              <button className="btn-line" type="button" onClick={() => setRemoving(null)}>Cancel</button>
              <button className="btn danger" type="submit" disabled={busy}>{busy ? "Deleting" : "Delete"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Caret({ on, dir }: { on: boolean; dir: "asc" | "desc" }) {
  return (
    <svg className={on && dir === "asc" ? "up" : ""} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
