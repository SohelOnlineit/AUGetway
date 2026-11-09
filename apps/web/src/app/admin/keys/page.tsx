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

const abilityCopy: Record<string, string> = {
  "payment:checkout": "Create a checkout",
  "payment:verify": "Verify a checkout",
};

function expiryLabel(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function dateInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
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
  const [copied, setCopied] = useState("");
  const [draft, setDraft] = useState<{ id: string; label: string; abilities: string[]; webhookUrl: string; expiresAt: string } | null>(null);
  const [removing, setRemoving] = useState<KeyRow | null>(null);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const issued = sessionStorage.getItem("uniqpay_fresh_key");
    if (issued) {
      try {
        const parsed = JSON.parse(issued) as { id: string; token: string };
        if (parsed.id && parsed.token) setSeen({ [parsed.id]: parsed.token });
      } catch {
        setSeen({});
      }
      sessionStorage.removeItem("uniqpay_fresh_key");
    }
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
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      window.setTimeout(() => setCopied((current) => (current === id ? "" : current)), 1500);
    } catch {
      setError("Could not copy the key");
    }
  }

  function openEdit(row: KeyRow) {
    setFormError("");
    setDraft({
      id: row.id,
      label: row.label,
      abilities: Array.isArray(row.abilities) ? row.abilities.filter((item) => item === "payment:checkout" || item === "payment:verify") : [],
      webhookUrl: row.webhookUrl,
      expiresAt: dateInput(row.expiresAt),
    });
  }

  function toggleDraftAbility(ability: string) {
    setDraft((current) => current && ({
      ...current,
      abilities: current.abilities.includes(ability)
        ? current.abilities.filter((item) => item !== ability)
        : [...current.abilities, ability],
    }));
  }

  async function saveEdit() {
    if (!draft || busy) return;
    const label = draft.label.trim();
    if (label.length < 2) {
      setFormError("Key name must be at least 2 characters");
      return;
    }
    if (draft.abilities.length === 0) {
      setFormError("Choose at least one ability");
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      await api(`/desk/keys/${draft.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          label,
          abilities: draft.abilities,
          webhookUrl: draft.webhookUrl.trim(),
          expiresAt: draft.expiresAt,
        }),
      });
      setRows((current) => current.map((row) => (
        row.id === draft.id
          ? { ...row, label, abilities: draft.abilities, webhookUrl: draft.webhookUrl.trim(), expiresAt: draft.expiresAt ? new Date(`${draft.expiresAt}T23:59:59`).toISOString() : null }
          : row
      )));
      setDraft(null);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not save");
    } finally {
      setBusy(false);
    }
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

  return (
    <div className="keys-page">
      <section className="keys-card">
        <header className="keys-head">
          <div>
            <p className="keys-crumb">Api Keys <span>›</span> List</p>
            <h2>Api Keys</h2>
          </div>
          <Link className="btn" href="/admin/api-keys/create">New API Key</Link>
        </header>
        <div className="keys-tools">
          <label className="keys-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input value={query} placeholder="Search" onChange={(event) => setQuery(event.target.value)} />
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
        <table className="keys-table">
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
          {filtered.length > 0 ? (
            <tbody>
              {filtered.map((row) => {
                const secret = seen[row.id] ?? `${row.prefix}…`;
                const abilities = Array.isArray(row.abilities) ? row.abilities : [];
                return (
                  <tr key={row.id}>
                    {shown.name ? <td className="name">{row.label}</td> : null}
                    {shown.type ? (
                      <td>
                        <span className="key-type">Checkout</span>
                      </td>
                    ) : null}
                    {shown.key ? (
                      <td>
                        <div className="key-line">
                          <span className="key-secret">{secret}</span>
                          <button className="key-copy" type="button" aria-label={copied === row.id ? "Copied" : "Copy API key"} onClick={() => copyKey(row.id, secret)}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="9" y="9" width="11" height="11" rx="2" />
                              <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    ) : null}
                    {shown.abilities ? (
                      <td className="key-abilities">{abilities.map((ability) => <span key={ability}>{ability}</span>)}</td>
                    ) : null}
                    {shown.expires ? <td className="muted">{expiryLabel(row.expiresAt)}</td> : null}
                    {shown.active ? (
                      <td>
                        <button className={`switch ${row.active ? "on" : ""}`} type="button" aria-label={row.active ? "Turn off" : "Turn on"} onClick={() => toggleActive(row)}>
                          <span />
                        </button>
                      </td>
                    ) : null}
                    <td>
                      <div className="dev-actions">
                        <button type="button" className="dev-edit" onClick={() => openEdit(row)}>
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                          Edit
                        </button>
                        <button type="button" className="dev-delete" onClick={() => { setFormError(""); setRemoving(row); }}>
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ) : null}
        </table>
        {ready && filtered.length === 0 ? (
          <div className="keys-empty">
            <div>
              <span className="mark">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M8 8l8 8M16 8l-8 8" />
                </svg>
              </span>
              <strong>No api keys</strong>
            </div>
          </div>
        ) : null}
      </section>
      {error ? <p className="error">{error}</p> : null}
      {draft ? (
        <div className="modal-back" onClick={() => { if (!busy) setDraft(null); }}>
          <form className="modal dev-modal" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void saveEdit(); }}>
            <header className="dev-modal-head">
              <div>
                <p className="keys-crumb">Api Keys <span>›</span> Edit</p>
                <h2>Edit API key</h2>
              </div>
              <button className="dev-close" type="button" onClick={() => setDraft(null)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18" /></svg>
                Close
              </button>
            </header>
            <div className="dev-modal-body">
              <label>
                <span>Key name</span>
                <input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} required minLength={2} maxLength={80} />
              </label>
              <fieldset>
                <legend>Abilities</legend>
                <div className="key-checks">
                  {Object.entries(abilityCopy).map(([ability, label]) => (
                    <label key={ability}>
                      <input type="checkbox" checked={draft.abilities.includes(ability)} onChange={() => toggleDraftAbility(ability)} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label>
                <span>Webhook URL</span>
                <input value={draft.webhookUrl} placeholder="https://your-domain.com/api/payment-webhook" onChange={(event) => setDraft({ ...draft, webhookUrl: event.target.value })} />
              </label>
              <label>
                <span>Expires at</span>
                <input type="date" value={draft.expiresAt} onChange={(event) => setDraft({ ...draft, expiresAt: event.target.value })} />
              </label>
              <p className="muted">The secret key stays the same. Copy it from the list when it is still shown in full.</p>
              {formError ? <p className="error">{formError}</p> : null}
            </div>
            <div className="dev-modal-actions">
              <button className="btn-line" type="button" onClick={() => setDraft(null)}>Cancel</button>
              <button className="btn" type="submit" disabled={busy}>{busy ? "Saving" : "Save"}</button>
            </div>
          </form>
        </div>
      ) : null}
      {removing ? (
        <div className="modal-back" onClick={() => { if (!busy) setRemoving(null); }}>
          <form className="modal dev-modal" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void removeKey(); }}>
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
